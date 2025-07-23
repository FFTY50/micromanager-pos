/**
 * Authentic Verifone Commander POS Mock Data
 * Based on real field data collected from Verifone terminals
 * 
 * Data format follows actual serial output patterns:
 * - Control sequences: \x1bc0\x01\x1b!\x00
 * - Timestamp format: MM/DD/YY HH:MM:SS
 * - Terminal ID: 102 (3-digit)
 * - Item codes: L (likely taxable), H (high-tax items), HL (hot lunch)
 * - Transaction flow: Items → TOTAL → Payment → Store info
 */

const VERIFONE_MOCK_TRANSACTIONS = [
    // Transaction 1: Convenience store items with cash payment
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:01 102 L  Monster Blue Hawaiia   1        3.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:03 102 L     PROPEL GRAPE 20oz   1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:05 102           PREPAY CA #05   1       15.00 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:06 102                       TOTAL       20.78 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102                        CASH       25.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102 ST#1                   DR#1 TRAN#1028401\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102 CSH: CORPORATE         07/23/25 10:15:15\x0a'
    ],

    // Transaction 2: Tobacco purchase (high-tax items)
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:12 102 Trans#1028402 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 10:20:12 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 10:20:12 102 H           NEWPORT BOX   1       10.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:14 102 H               TOBACCO   1        5.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:16 102                       TOTAL       16.18 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:25 102                       DEBIT       16.18 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:20:25 102 ST#1                   DR#1 TRAN#1028402\x1bc0\x01\x1b!\x0007/23/25 10:20:25 102 CSH: CORPORATE         07/23/25 10:20:25\x0a'
    ],

    // Transaction 3: Snacks and drinks
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:30 102 L  Canada dry [591]ML 2   1        2.39 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:32 102 L  CANADA DRY GNGR ALE    1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:34 102 L    SNICKERS KING SIZE   1        3.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:36 102                       TOTAL        7.87 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:40 102                        CASH       10.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:25:40 102 ST#1                   DR#1 TRAN#1028403\x1bc0\x01\x1b!\x0007/23/25 10:25:40 102 CSH: CORPORATE         07/23/25 10:25:40\x0a'
    ],

    // Transaction 4: Single item purchase
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:30:15 102 L     ARIZONA sweet tea   1        0.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:30:17 102                       TOTAL        0.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:30:20 102                        CASH        1.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:30:20 102 ST#1                   DR#1 TRAN#1028404\x1bc0\x01\x1b!\x0007/23/25 10:30:20 102 CSH: CORPORATE         07/23/25 10:30:20\x0a'
    ],

    // Transaction 5: Novelty items with manual entry
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:35:45 102 Trans#1028405 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 10:35:45 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 10:35:45 102 H         NOVELTY ITEMS   1        8.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:35:47 102 L           BATH TISSUE   1        1.59 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:35:49 102                       TOTAL       10.58 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:35:55 102                        CASH       11.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:35:55 102 ST#1                   DR#1 TRAN#1028405\x1bc0\x01\x1b!\x0007/23/25 10:35:55 102 CSH: CORPORATE         07/23/25 10:35:55\x0a'
    ],

    // Transaction 6: Multiple beverages
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:40:22 102 L                BAHAMA   1        2.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:40:24 102 L          MISTIC GRAPE   1        2.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:40:26 102 L      SPRITE 16.OZ CAN   1        1.89 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:40:28 102                       TOTAL        6.87 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:40:35 102                       DEBIT        6.87 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:40:35 102 ST#1                   DR#1 TRAN#1028406\x1bc0\x01\x1b!\x0007/23/25 10:40:35 102 CSH: CORPORATE         07/23/25 10:40:35\x0a'
    ],

    // Transaction 7: Candy and gum
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:45:10 102 L  Life savers gummies    1        3.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:45:12 102 H         FLASH POINT N   1        1.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:45:14 102                       TOTAL        4.78 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:45:18 102                       DEBIT        4.78 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:45:18 102 ST#1                   DR#1 TRAN#1028407\x1bc0\x01\x1b!\x0007/23/25 10:45:18 102 CSH: CORPORATE         07/23/25 10:45:18\x0a'
    ],

    // Transaction 8: Energy drinks and slush
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:50:33 102 H  STEEL R CHERRY SLUSH   1        1.39 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:50:35 102 H  STEEL WATERMELON 16.   1        1.39 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:50:37 102 L           Low Grocery   1        0.98 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:50:39 102                       TOTAL        3.76 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:50:45 102                        CASH        4.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:50:45 102 ST#1                   DR#1 TRAN#1028408\x1bc0\x01\x1b!\x0007/23/25 10:50:45 102 CSH: CORPORATE         07/23/25 10:50:45\x0a'
    ],

    // Transaction 9: Alcohol purchase (beer)
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:55:20 102 Trans#1028409 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 10:55:20 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 10:55:20 102 H  BUD LIGHT 16 OZ LONG   1        1.85 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:55:22 102                       TOTAL        2.00 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:55:25 102                        CASH        2.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:55:25 102 ST#1                   DR#1 TRAN#1028409\x1bc0\x01\x1b!\x0007/23/25 10:55:25 102 CSH: CORPORATE         07/23/25 10:55:25\x0a'
    ],

    // Transaction 10: Hot food item
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:00:08 102 HL             HOT FOOD   1        2.69 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:00:10 102                       TOTAL        2.69 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:00:15 102                        CASH        3.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:00:15 102 ST#1                   DR#1 TRAN#1028410\x1bc0\x01\x1b!\x0007/23/25 11:00:15 102 CSH: CORPORATE         07/23/25 11:00:15\x0a'
    ],

    // Transaction 11: Large tobacco and cigarette purchase
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:05:42 102 Trans#1028411 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 11:05:42 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 11:05:42 102 H    MARLBORO M 100 BOX   1        9.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:05:44 102 H           GAME SILVER   3        3.87 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:05:46 102                       TOTAL       13.86 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:05:55 102                       DEBIT       13.86 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:05:55 102 ST#1                   DR#1 TRAN#1028411\x1bc0\x01\x1b!\x0007/23/25 11:05:55 102 CSH: CORPORATE         07/23/25 11:05:55\x0a'
    ],

    // Transaction 12: Preauth transaction (gas prepay)
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:10:18 102           PREPAY CA #03   1       10.00 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:10:20 102                       TOTAL       10.00 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:10:29 102                     PREAUTH       10.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:10:29 102 ST#1                   DR#1 TRAN#1028412\x1bc0\x01\x1b!\x0007/23/25 11:10:29 102 CSH: CORPORATE         07/23/25 11:10:29\x0a'
    ],

    // Transaction 13: Mixed grocery and beverage
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:15:33 102 L  CANADA DRY GNGR ALE    1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:15:35 102 L           BATH TISSUE   1        1.59 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:15:37 102 L    SNICKERS KING SIZE   1        3.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:15:39 102                       TOTAL        7.07 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:15:45 102                        CASH       10.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:15:45 102 ST#1                   DR#1 TRAN#1028413\x1bc0\x01\x1b!\x0007/23/25 11:15:45 102 CSH: CORPORATE         07/23/25 11:15:45\x0a'
    ],

    // Transaction 14: Energy drinks variety
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:20:12 102 L  Monster Blue Hawaiia   1        3.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:20:14 102 L     ARIZONA sweet tea   1        0.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:20:16 102 L     PROPEL GRAPE 20oz   1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:20:18 102                       TOTAL        6.77 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:20:25 102                       DEBIT        6.77 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:20:25 102 ST#1                   DR#1 TRAN#1028414\x1bc0\x01\x1b!\x0007/23/25 11:20:25 102 CSH: CORPORATE         07/23/25 11:20:25\x0a'
    ],

    // Transaction 15: Candy and gum variety
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:25:50 102 L  Life savers gummies    1        3.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:25:52 102 L                BAHAMA   1        2.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:25:54 102                       TOTAL        5.78 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:25:58 102                        CASH        6.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:25:58 102 ST#1                   DR#1 TRAN#1028415\x1bc0\x01\x1b!\x0007/23/25 11:25:58 102 CSH: CORPORATE         07/23/25 11:25:58\x0a'
    ],

    // Transaction 16: Single high-value item
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:30:25 102 Trans#1028416 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 11:30:25 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 11:30:25 102 H         NOVELTY ITEMS   1        8.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:30:27 102                       TOTAL        8.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:30:32 102                       DEBIT        8.99 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:30:32 102 ST#1                   DR#1 TRAN#1028416\x1bc0\x01\x1b!\x0007/23/25 11:30:32 102 CSH: CORPORATE         07/23/25 11:30:32\x0a'
    ],

    // Transaction 17: Mixed beverages with different sizes
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:35:40 102 L  Canada dry [591]ML 2   1        2.39 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:35:42 102 L      SPRITE 16.OZ CAN   1        1.89 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:35:44 102 L          MISTIC GRAPE   1        2.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:35:46 102                       TOTAL        6.77 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:35:50 102                        CASH        7.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:35:50 102 ST#1                   DR#1 TRAN#1028417\x1bc0\x01\x1b!\x0007/23/25 11:35:50 102 CSH: CORPORATE         07/23/25 11:35:50\x0a'
    ],

    // Transaction 18: Tobacco and energy combination
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:40:15 102 Trans#1028418 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 11:40:15 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 11:40:15 102 H           NEWPORT BOX   1       10.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:40:17 102 H  STEEL WATERMELON 16.   1        1.39 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:40:19 102                       TOTAL       11.58 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:40:28 102                       DEBIT       11.58 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:40:28 102 ST#1                   DR#1 TRAN#1028418\x1bc0\x01\x1b!\x0007/23/25 11:40:28 102 CSH: CORPORATE         07/23/25 11:40:28\x0a'
    ],

    // Transaction 19: Large convenience store purchase
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:33 102 L    SNICKERS KING SIZE   1        3.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:35 102 L  Life savers gummies    1        3.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:37 102 L     PROPEL GRAPE 20oz   1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:39 102 L           BATH TISSUE   1        1.59 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:41 102 L           Low Grocery   1        0.98 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:43 102                       TOTAL       11.34 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:45:50 102                        CASH       15.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:45:50 102 ST#1                   DR#1 TRAN#1028419\x1bc0\x01\x1b!\x0007/23/25 11:45:50 102 CSH: CORPORATE         07/23/25 11:45:50\x0a'
    ],

    // Transaction 20: Final mixed transaction
    [
        '\x1bc0\x01\x1b!\x0007/23/25 11:50:22 102 L     ARIZONA sweet tea   1        0.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:50:24 102 H         FLASH POINT N   1        1.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:50:26 102 HL             HOT FOOD   1        2.69 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:50:28 102                       TOTAL        5.17 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 11:50:35 102                       DEBIT        5.17 \x0a\x1bc0\x01\x1b!\x0007/23/25 11:50:35 102 ST#1                   DR#1 TRAN#1028420\x1bc0\x01\x1b!\x0007/23/25 11:50:35 102 CSH: CORPORATE         07/23/25 11:50:35\x0a'
    ]
];

/**
 * Get a random Verifone transaction from the mock data
 * @returns {string[]} Array of transaction lines
 */
function getRandomVerifoneTransaction() {
    const randomIndex = Math.floor(Math.random() * VERIFONE_MOCK_TRANSACTIONS.length);
    return VERIFONE_MOCK_TRANSACTIONS[randomIndex];
}

/**
 * Get all Verifone mock transactions
 * @returns {string[][]} Array of all transaction arrays
 */
function getAllVerifoneTransactions() {
    return VERIFONE_MOCK_TRANSACTIONS;
}

/**
 * Generate a transaction with updated timestamp
 * @param {number} transactionIndex - Index of transaction to use
 * @param {Date} timestamp - Timestamp to use for the transaction
 * @returns {string[]} Transaction lines with updated timestamp
 */
function generateVerifoneTransactionWithTimestamp(transactionIndex = null, timestamp = new Date()) {
    const index = transactionIndex !== null ? transactionIndex : Math.floor(Math.random() * VERIFONE_MOCK_TRANSACTIONS.length);
    const transaction = VERIFONE_MOCK_TRANSACTIONS[index];
    
    // Format timestamp as MM/DD/YY HH:MM:SS
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const year = String(timestamp.getFullYear()).slice(-2);
    const hours = String(timestamp.getHours()).padStart(2, '0');
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const seconds = String(timestamp.getSeconds()).padStart(2, '0');
    
    const timeStr = `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
    
    // Replace timestamps in transaction lines
    return transaction.map(line => {
        return line.replace(/\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/g, timeStr);
    });
}

module.exports = {
    VERIFONE_MOCK_TRANSACTIONS,
    getRandomVerifoneTransaction,
    getAllVerifoneTransactions,
    generateVerifoneTransactionWithTimestamp
};
