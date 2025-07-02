# HarperDB Studio

The comprehensive management suite for HarperDB.

- [https://studio.harperdb.io](https://studio.harperdb.io)

## What’s in the box

- Third party software (click to review each library's licensing)
  - [ReactJS](https://reactjs.org/) site scaffold via Create React App
  - [react-router](https://reacttraining.com/react-router/) for navigation
  - [pullstate](https://lostpebble.github.io/pullstate/) for global state management

## Magic... how does it work?

Follow these steps to run a local version of HarperDB Studio.

1. **In your terminal, clone the UI scaffold, enter the directory, and install dependencies.**

   ```
   git clone https://github.com/harperdb/hdbms.git
   cd hdbms
   yarn
   ```

1. **Create your local config file.**

   - Create a copy of the file `/src/config/index.example.js`, renaming it `index.js`.
   - update the `stripe_public_key` and/or other variables in that file as desired
   - save the file
   - **Never commit `/src/config/index.js` to GitHub!**

1. **Generate https certificates for local development**

   Install mkcert tool (OS X)

   ```
   brew install mkcert
   brew install nss (if you need Firefox)
   ```

   Install mkcert tool (Windows)

   ```
   scoop bucket add extras
   scoop install mkcert
   ```

   Setup mkcert on your machine (creates a CA)

   ```
   mkcert -install
   ```

   Create .cert directory if it doesn't exist

   ```
   mkdir -p .cert
   ```

   Generate the certificate (ran from the root of this project)

   ```
   mkcert -key-file ./.cert/key.pem -cert-file ./.cert/cert.pem "localhost"
   ```

   **NOTE:** If you use Firefox, restart it to get the cert to take effect.

1. Start the project.

   ```
   yarn start
   ```

1. Visit the project at https://localhost:3000.
   - The development web server uses a self-signed certificate, and you may see a warning about the site being insecure. In your local development environment, it is safe to click "Advanced" > "proceed to site anyway."
