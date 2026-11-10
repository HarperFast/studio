# Backups — design notes

Harper's managed backups (harper `dataLayer/rocksdbBackup.ts`, epic harper#2100) ship in **5.2.0**; no 5.2.0
prerelease carries them, and the request and response shapes are the same from 5.2.0 through 5.4. Restore and
`get_backup` are out of scope (studio#2008 says why).

## Every request goes to one node, and the same one

A backup lives on the disk of the node that took it, under `storage.backupPath`. A cluster's own operations address
is no good for that: central manager's `Cluster.js` proxy sends each request to whichever member is first in its
running list, so a list could reach another node than the one that took the backup and the backup would seem to
vanish. So on a cluster's page the Backups tab lists the members from the cluster record and reaches each through
`/HDBInstance/<id>/operation` (`getInstanceClientIdFromParams({ instanceId, forceFabricConnect: true })`), the same
client `InstanceStatusCell` uses. From an instance's own page, or in the Studio a Harper serves, the page's own
connection already reaches exactly one node, so it is used as is.

The job a create or verify starts must be read from that same client: `hdb_job` does not replicate, so another member
has no record of it. `backupJobQueryOptions` takes the node's client for that reason.

Members that are terminating, terminated or removed are left out: their disk, and every backup on it, is gone. A
member Fabric's proxy refuses (`isOperationsProxyRefused`), one with no address, or one on a Harper older than 5.2
gets a line saying so instead of a request that is bound to fail. A self-hosted cluster gets a pointer to each
instance's own page, because a self-hosted instance record has no `hostId` (central-manager `addCluster.js`) and the
proxy routes by host.

On a cluster the page shows once any live member runs 5.2 (`anyMemberSupportsBackups`), not on the cluster's
`registration_info`: that comes from whichever member answers first, so mid-upgrade an old one would hide every
upgraded one. The Config nav entry uses the same rule.

## Who may use it

Every backup operation calls `requireSuperUser` in Harper, so the page is gated like every Config tab, on
`useInstanceManagePermission`. Through Fabric the request runs on the instance's operations socket, which Harper
treats as local, so central manager's `canUpdateInstance` check on `/HDBInstance/<id>/operation` is the real gate:
without cluster update permission the page says so instead of sending requests that 403.

## What the numbers mean

`timestamp` is RocksDB's `BackupInfo.timestamp`, in **seconds**. `size` counts every database file the backup uses,
including files it shares with other backups, so sizes don't add up to the disk the backups use (two backups taken a
moment apart report the same size). The blob snapshot is a separate, Harper-managed directory, so `size` never counts
file attachments.

Harper starts the ids over at 1 once every backup of a database is deleted, so an id alone doesn't name one backup
over time. A verify result is shown on a row only when both the id and the timestamp match the backup it verified, and
a delete or verify re-reads the list first (`assertStillListed`), refusing with `BackupChangedError` unless the id still
names a backup with the same defined timestamp, size and file count. Harper exposes no other identity and takes no
precondition, so a same-second replacement that matches all three, or one landing between that read and the request,
still gets through.

## Keep newest N

`purge_backups` keeps the newest `keep_count` backups by id. The confirmation computes what goes from the list the
page shows (`backupsRemovedByPurge`), and the success toast reports Harper's own `deleted` count, saying so when the
two differ, and never states a count Harper didn't send. They can: `list_backups` shows only backups whose creation finished, while a purge counts every backup in
the repository, and another administrator may have changed it since the list was read. `keep_count` must be at least
1 here, although Harper accepts 0; deleting every backup is one Delete per row, on purpose.

Every dialog records the database it was opened for and closes if the page moves to another one under it (a
`describe_all` refetch can change the default), so a confirmation never acts on a database the user didn't choose.

## Jobs

`create_backup` and `verify_backup` start a background job. Harper reports a job only as created, in progress, or
ended, with no progress figure, so the page shows "running" with the time it started, then the result Harper recorded
(the new backup's id from `result.backup_id`, or the failure's `message`). While one of the page's jobs runs on a node,
every write button on that node is held, Verify included: Harper takes one
write at a time per database's backups and answers the rest with a 409. A job Studio stops reading (missing for 20 s, or
a 403, which stops the poll for good and is never retried first) is reported as unknown, never as failed, and releases the hold. So is a create or
verify Harper accepted without naming a job (`BackupJobUnreportedError`, in `describeUnknownOutcome`).
