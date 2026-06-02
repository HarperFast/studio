---
name: querying-rest-apis
description: 'How to use query parameters to filter, sort, and paginate Harper REST APIs.'
metadata:
  mode: generate
  sources:
    - reference/v5/rest/querying.md
  sourceCommit: b7fbddadd42eb4487190b650a9abc4bcfeef5819
  inputHash: 9f8c981a629ef606
---

# Querying REST APIs

Instructions for the agent to filter, sort, select, and paginate Harper REST API collections using URL query parameters.

## When to Use

Apply this rule when building or modifying code that queries Harper REST endpoints with filtering, sorting, field selection, or pagination. Use it whenever constructing URLs against collection paths exposed by Harper's automatic REST interface (see [automatic-apis.md](automatic-apis.md)).

## How It Works

1. **Filter by attribute**: Add query parameters matching attribute names and values. The queried attribute must be indexed.

   ```
   GET /Product/?category=software
   GET /Product/?category=software&inStock=true
   ```

2. **Apply comparison operators (FIQL syntax)**: Use FIQL operators directly in query parameter values.

   | Operator     | Meaning                                |
   | ------------ | -------------------------------------- |
   | `==`         | Equal                                  |
   | `=lt=`       | Less than                              |
   | `=le=`       | Less than or equal                     |
   | `=gt=`       | Greater than                           |
   | `=ge=`       | Greater than or equal                  |
   | `=ne=`, `!=` | Not equal                              |
   | `=ct=`       | Contains (strings)                     |
   | `=sw=`       | Starts with (strings)                  |
   | `=ew=`       | Ends with (strings)                    |
   | `=`, `===`   | Strict equality (no type conversion)   |
   | `!==`        | Strict inequality (no type conversion) |

   ```
   GET /Product/?price=gt=100
   GET /Product/?price=le=20
   GET /Product/?name==Keyboard*
   GET /Product/?category=software&price=gt=100&price=lt=200
   ```

   For date fields, URL-encode colons as `%3A`:

   ```
   GET /Product/?listDate=gt=2017-03-08T09%3A30%3A00.000Z
   ```

3. **Chain conditions for range queries**: Omit the attribute name on the second condition to apply it to the same attribute. Only `gt`/`ge` combined with `lt`/`le` is supported.

   ```
   GET /Product/?price=gt=100&lt=200
   ```

4. **Combine conditions with OR logic**: Use `|` instead of `&`.

   ```
   GET /Product/?rating=5|featured=true
   ```

5. **Group conditions**: Use parentheses or square brackets to control order of operations. Prefer square brackets when constructing queries from user input, since standard URI encoding safely encodes `[` and `]`.

   ```
   GET /Product/?rating=5|(price=gt=100&price=lt=200)
   GET /Product/?rating=5&[tag=fast|tag=scalable|tag=efficient]
   ```

   Construct grouped queries from JavaScript:

   ```javascript
   let url = `/Product/?rating=5&[${tags.map(encodeURIComponent).join('|')}]`;
   ```

6. **Select specific properties with `select(`**: Use `select()` to control which fields are returned.

   | Syntax                                 | Returns                                     |
   | -------------------------------------- | ------------------------------------------- |
   | `?select(property)`                    | Values of a single property directly        |
   | `?select(property1,property2)`         | Objects with only the specified properties  |
   | `?select([property1,property2])`       | Arrays of property values                   |
   | `?select(property1,)`                  | Objects with a single specified property    |
   | `?select(property{subProp1,subProp2})` | Nested objects with specific sub-properties |

   ```
   GET /Product/?category=software&select(name)
   GET /Product/?brand.name=Microsoft&select(name,brand{name})
   ```

7. **Limit results with `limit(`**: Use `limit(end)` or `limit(start,end)` to paginate.

   ```
   GET /Product/?rating=gt=3&inStock=true&select(rating,name)&limit(20)
   GET /Product/?rating=gt=3&limit(10,30)
   ```

8. **Sort results with `sort(`**: Use `sort(property)` or `sort(+property,-property,...)`. Prefix `+` or no prefix = ascending; `-` = descending.

   ```
   GET /Product/?rating=gt=3&sort(+name)
   GET /Product/?sort(+rating,-price)
   ```

9. **Query across relationships**: Use dot-syntax to filter by related table attributes. Relationships must be defined in the schema using `@relation`.

   ```
   GET /Product/?brand.name=Microsoft
   GET /Brand/?products.name=Keyboard
   ```

   Use `select()` to include relationship attributes in the response (they are not included by default):

   ```
   GET /Product/?brand.name=Microsoft&select(name,brand{name})
   ```

10. **Access a specific property by URL**: Append the property name with dot syntax to the record ID. Only works for properties declared in the schema.
    ```
    GET /MyTable/123.propertyName
    ```

## Examples

**Range filter with select and limit:**

```
GET /Product/?category=software&price=gt=100&price=lt=200&select(name,price)&limit(20)
```

**Sort descending with multiple fields:**

```
GET /Product/?sort(+rating,-price)
```

**OR logic with grouping:**

```
GET /Product/?price=lt=100|[rating=5&[tag=fast|tag=scalable|tag=efficient]&inStock=true]
```

**Relationship join with nested select:**

```
GET /Product/?brand.name=Microsoft&select(name,brand{name,id})
```

**Schema defining a relationship for join queries:**

```graphql
type Product @table @export {
	id: Long @primaryKey
	name: String
	brandId: Long @indexed
	brand: Brand @relation(from: "brandId")
}
type Brand @table @export {
	id: Long @primaryKey
	name: String
	products: [Product] @relation(to: "brandId")
}
```

**Many-to-many relationship query:**

```graphql
type Product @table @export {
	id: Long @primaryKey
	name: String
	resellerIds: [Long] @indexed
	resellers: [Reseller] @relation(from: "resellerId")
}
```

```
GET /Product/?resellers.name=Cool Shop&select(id,name,resellers{name,id})
```

**Type conversion with explicit prefix:**

```
GET /Product/?price==number:123
GET /Product/?active==boolean:true
GET /Product/?listDate==date:2024-01-05T20%3A07%3A27.955Z
```

## Notes

- Only indexed attributes can be used as the primary filter; additional unindexed attributes can be combined with `&` once at least one indexed attribute is present.
- For null value queries, use `?attribute=null`. Indexes must have been created with null indexing support; existing indexes must be removed and re-added to support null queries.
- FIQL comparators (`==`, `!=`, `=gt=`, etc.) apply automatic type conversion based on value syntax or schema-declared type. Strict operators (`=`, `===`, `!==`) skip automatic type conversion.
- Filtering by a related attribute produces INNER JOIN behavior (only records with a matching related record are returned). Using `select()` on a relationship without a filter produces LEFT JOIN behavior.
- The array order of foreign key values in many-to-many relationships is preserved when resolving the relationship.
- See [automatic-apis.md](automatic-apis.md) for how Harper tables are automatically exposed as REST endpoints.
