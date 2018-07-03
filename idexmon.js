'use strict';

const fetch = require('node-fetch'),
    sqlite3 = require('sqlite3').verbose(),
    notifier = require('node-notifier'),
    fs = require('fs'),
    moment = require('moment');

const db = new sqlite3.Database('idex.sqlite');
global.message = '';

db.on('error', error => {
    console.log('SQLite error: ' + error);
});

process.on('exit', function() {
    db.close();

    console.log('Done with everything.');
});

const readLocalIdexDatabase = new Promise((resolve, reject) => {
    try {
        let query = 'SELECT market, lastPrice, lowestAsk, highestBid FROM Markets';

        db.all(query, [], (err, rows) => {
            if (err) {
                throw err;
            }

            let markets = [];
            console.log('Reading from database.');

            rows.forEach(market => {
                markets.push({
                    market: market.market,
                    lastPrice: market.lastPrice,
                    lowestAsk: market.lowestAsk,
                    highestBid: market.highestBid
                });
            });

            resolve(markets);
        });
    } catch (err) {
        reject(err);
    }
});

const readMarketsFromApi = new Promise((resolve, reject) => {
    try {
        fetch('https://api.idex.market/returnTicker', {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.167 Safari/537.36'
            }
        })
            .then(res => res.json())
            .then(json => {
                resolve(json);
            });
    } catch (err) {
        console.log(err);
        reject(err);
    }
});

Promise.all([readLocalIdexDatabase, readMarketsFromApi]).then(values => {
    this.dbMarkets = values[0];
    this.apiMarkets = values[1];
    var that = this;

    Object.keys(that.apiMarkets).forEach(apiMarket => {
        let matchingMarket = that.dbMarkets.find(x => x.market === apiMarket);

        if (typeof matchingMarket === 'undefined') {
            console.log(`${apiMarket} seems to be a new token.`);
            notifier.notify({
                title: 'New token!',
                message: `${apiMarket} seems to be a new token.`,
                wait: true
            });

            fs.appendFileSync('idex-changes.txt', `${moment().format()} ${apiMarket} seems to be a new token.\r\n`);

            let query = `INSERT INTO Markets
            (market, lastPrice, lowestAsk, highestBid)
            VALUES (
                '${apiMarket}', '${that.apiMarkets[apiMarket].last}', '${that.apiMarkets[apiMarket].lowestAsk}', '${
                that.apiMarkets[apiMarket].highestBid
            }'
            )`;

            db.serialize(function() {
                let stmt = db.prepare(query);
                stmt.run();
                stmt.finalize();
            });
        } else {
            // Token already exists, let's update some values
            let query = `UPDATE Markets SET lastPrice = '${that.apiMarkets[apiMarket].last}', lowestAsk = '${
                that.apiMarkets[apiMarket].lowestAsk
            }', highestBid = '${that.apiMarkets[apiMarket].highestBid}'
            WHERE market = '${apiMarket}'
            `;

            db.serialize(function() {
                let stmt = db.prepare(query);
                stmt.run();
                stmt.finalize();
            });
        }
    });
});
