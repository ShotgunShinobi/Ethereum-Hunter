// Importing requirements
import express from 'express';
import bodyParser from 'body-parser';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Network, Alchemy } from 'alchemy-sdk';
import BigNumber from 'bignumber.js';
import sqlite3 from 'sqlite3';

const { Database } = sqlite3.verbose(); 

// Directory name and file name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000; // Setting the port to 3000

const settings = {
  apiKey: "0-ZKJ8Tws1DDBJ_kujcQ_cDNjtILfgQx", // API Key should be here
  network: Network.ETH_MAINNET, 
};
const alchemy = new Alchemy(settings);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public'))); // Serving static files from 'public' directory

// Route to run Tracker script
app.get('/run-tracker', (req, res, next) => {
  exec('node Tracker.mjs', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return next(new Error('Error running Tracker script')); // Pass error to centralized error handler
    }
    res.send(stdout);
  });
});

// Route to run Tracer script with input
app.post('/run-tracer', async (req, res, next) => {
  const txHash = req.body.text;
  try {
    const result = await extractTransactionDetails(txHash);
    res.json(result);
  } catch (error) {
    next(error); // Pass error to centralized error handler
  }
});

// Function to extract transaction details
async function extractTransactionDetails(txHash) {
  try {
    const receipt = await alchemy.core.getTransactionReceipt(txHash);
    const transaction = await alchemy.core.getTransaction(txHash);
    const block = await alchemy.core.getBlock(receipt.blockNumber);

    const gasUsed = new BigNumber(receipt.gasUsed.toString());
    const effectiveGasPrice = new BigNumber(receipt.effectiveGasPrice.toString());
    const feeInWei = gasUsed.multipliedBy(effectiveGasPrice);

    const weiToEtherFactor = new BigNumber(10).pow(18);
    const feeInEther = feeInWei.dividedBy(weiToEtherFactor);
    const formattedFeeInEther = feeInEther.toFixed(18);

    const timestamp = block.timestamp;
    const date = new Date(timestamp * 1000);
    const formattedDate = date.toISOString();

    const logs = await alchemy.core.getLogs({
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      address: transaction.to,
      topics: []
    });

    const internalTransactions = logs.map(log => ({
      from: log.address,
      to: log.topics[1],
      value: new BigNumber(log.data).dividedBy(weiToEtherFactor).toFixed(18),
      gasUsed: receipt.gasUsed.toString()
    }));

    const result = {
      blockNumber: receipt.blockNumber,
      blockTimestamp: formattedDate,
      fee: formattedFeeInEther,
      hash: receipt.transactionHash,
      senderAddress: transaction.from,
      internalTransactions
    };

    await saveToDatabase(result);

    return result;
  } catch (error) {
    console.error('Error in extractTransactionDetails:', error);
    throw new Error('Error fetching transaction details'); // Ensure meaningful error message
  }
}

// Function to save data to the database
async function saveToDatabase(data) {
  return new Promise((resolve, reject) => {
    const db = new Database('./deposits.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('Database error:', err);
        return reject(err);
      }
    });

    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS deposits (
          blockNumber INTEGER NOT NULL,
          blockTimestamp TEXT NOT NULL,
          fee TEXT NOT NULL,
          hash TEXT NOT NULL,
          senderAddress TEXT NOT NULL,
          internalFrom TEXT,
          internalTo TEXT,
          internalValue TEXT,
          internalGasUsed INTEGER
        )
      `);

      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        INSERT INTO deposits (blockNumber, blockTimestamp, fee, hash, senderAddress)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(data.blockNumber, data.blockTimestamp, data.fee, data.hash, data.senderAddress, (err) => {
        if (err) {
          console.error('Error inserting main transaction:', err);
          return db.run('ROLLBACK', () => reject(err));
        }
      });

      data.internalTransactions.forEach(tx => {
        const internalStmt = db.prepare(`
          INSERT INTO deposits (blockNumber, blockTimestamp, fee, hash, senderAddress, internalFrom, internalTo, internalValue, internalGasUsed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        internalStmt.run(
          data.blockNumber,
          data.blockTimestamp,
          data.fee,
          data.hash,
          data.senderAddress,
          tx.from,
          tx.to,
          tx.value,
          tx.gasUsed,
          (err) => {
            if (err) {
              console.error('Error inserting internal transaction:', err);
              return db.run('ROLLBACK', () => reject(err));
            }
          }
        );
        internalStmt.finalize();
      });

      stmt.finalize();

      db.run('COMMIT', (err) => {
        if (err) {
          console.error('Error committing transaction:', err);
          return db.run('ROLLBACK', () => reject(err));
        }
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
            return reject(err);
          }
          resolve();
        });
      });
    });
  });
}

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Error details:', err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    status: err.status || 500,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }), // Include stack trace in development
  });
});

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
