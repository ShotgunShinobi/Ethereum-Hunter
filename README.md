# Ethereum Hunter

## Overview

Ethereum Hunter sets up an Express server to interact with Ethereum transactions using the Alchemy SDK. It provides endpoints to execute scripts and fetch transaction details from the Ethereum blockchain, including internal transactions. Results are stored in an SQLite database.

## Setup

### Prerequisites

- **Node.js**: Ensure you have Node.js installed (preferably the latest LTS version).
- **Dependencies**: Install the required npm packages by running:

  ```npm install express body-parser alchemy-sdk bignumber.js sqlite3 ```

- **Alchemy API Key**: Obtain an API key from Alchemy (a free tier key is sufficient for testing and basic usage).

### Configuration

- **Alchemy API Key**: Update the settings object in your code with your Alchemy API key.
- **SQLite Database**: The application uses an SQLite database file named deposits.db. Ensure the file is writable, or it will be created automatically if it does not exist.

## Usage

### Start the Server

- **To start the server, run**:

    ```node backend.mjs```

- The server will run in the local host and is ready for inputs.

### SQLite Database Schema

- **The application creates a deposits table with the following columns:**

- blockNumber: Integer
- blockTimestamp: Text (ISO Date String)
- fee: Text (Gas fee in Ether)
- hash: Text (Transaction hash)
- senderAddress: Text (Sender's Ethereum address)
- internalFrom: Text (Internal transaction sender address, nullable)
- internalTo: Text (Internal transaction recipient address, nullable)
- internalValue: Text (Internal transaction value in Ether, nullable)
- internalGasUsed: Integer (Internal transaction gas used, nullable)

## Error Handling
- Error Handling in Routes: Ensures that errors in route handlers are passed to the centralized error handler. This approach maintains a clean separation of concerns and leverages the centralized error handler for consistency.
- Centralized Error Handling Middleware: Provides a centralized location to handle errors and format error responses consistently. It ensures that all errors, whether from routes or async operations, are caught and managed in one place, improving maintainability and debugging. Including the stack trace in development helps in debugging, while it is omitted in production for security reasons.
- Enhanced Error Handling in extractTransactionDetails: Provides detailed error logging and throws a new error with a clear message, improving the ability to trace and understand the cause of failures.
- Enhanced Error Handling in saveToDatabase: Improves robustness in database operations by handling errors during table creation, data insertion, transaction management, and database closure. This ensures any issues are logged and properly handled, maintaining data integrity and providing useful error information.
## Notes

- Ensure the Tracker.mjs script is in the same directory as your entry file.

- The Tracker.mjs script, once activated watches for transactions on the Becon Contract Address: "0x00000000219ab540356cBB839Cbe05303d7705Fa", this is currently hardcoded in and can be changed to watch a different Becon Contract Address. If there is a transaction on that address, a popup will show on the page.

- The "public" folder has the HTML and CSS files required for the frontend.
