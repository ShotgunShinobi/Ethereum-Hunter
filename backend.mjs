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
app.use(express.static(join(__dirname, 'public'))); // Serving static files

// Route to run Tracker script
app.get('/run-tracker', (req, res) => {
  exec('node Tracker.mjs', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).send('Error running Tracker script');
    }
    res.send(stdout);
  });
});

// Route to run Tracer script with input
app.post('/run-tracer', async (req, res) => {
  const txHash = req.body.text;
  try {
    const result = await extractTransactionDetails(txHash);
    res.json(result);
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    res.status(500).send('Error fetching transaction details');
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
    const feeInEther = feeInWei.dividedBy(weiToEtherFactor).toFixed(18);

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
      to: log.topics[1] || 'N/A', // Adjust based on log structure
      value: new BigNumber(log.data || '0').dividedBy(weiToEtherFactor).toFixed(18),
      gasUsed: receipt.gasUsed.toString()
    }));

    const result = {
      blockNumber: receipt.blockNumber,
      blockTimestamp: formattedDate,
      fee: feeInEther,
      hash: receipt.transactionHash,
      senderAddress: transaction.from,
      internalTransactions
    };

    await saveToDatabase(result);
    return result;
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    throw error; // Ensure error is rethrown for proper handling
  }
}

// Function to save data to the database
async function saveToDatabase(data) {
  return new Promise((resolve, reject) => {
    const dbPath = join(__dirname, 'deposits.db');
    const db = new Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
        return;
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
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err.message);
          reject(err);
          return;
        }
      });

      // Start a transaction
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('Error starting transaction:', err.message);
          reject(err);
          return;
        }

        // Insert the main transaction data
        const stmt = db.prepare(`
          INSERT INTO deposits (blockNumber, blockTimestamp, fee, hash, senderAddress)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(data.blockNumber, data.blockTimestamp, data.fee, data.hash, data.senderAddress, (err) => {
          if (err) {
            console.error('Error inserting main data:', err.message);
            reject(err);
            return;
          }
        });

        // Insert internal transactions
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
                console.error('Error inserting internal transaction:', err.message);
                reject(err);
                return;
              }
            }
          );
          internalStmt.finalize();
        });

        // Finalize the main statement
        stmt.finalize();

        // Commit the transaction
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Error committing transaction:', err.message);
            reject(err);
            return;
          }

          // Close the database
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    });
  });
}

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
