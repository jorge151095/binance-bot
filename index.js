require('dotenv').config()
const ema = require('exponential-moving-average');
const BinanceExt = require('node-binance-api-ext')
const Binance = require('binance-api-node').default

const getEMA = async (client, symbol, interval, limit) => {
    const ticks = await client.futuresCandles({ symbol, interval, limit })
    const closeTicks = ticks.map(tick => tick.close)
    return ema(closeTicks, limit)
}

const tick = async(config, client, clientExt) => {
    const { asset, base, amount } = config;
    const symbol = `${asset}${base}`
    try {
        const ticker = await client.futuresMarkPrice(symbol)
        const ema85 = await getEMA(client, symbol, '1m', 85)
        const ema3 = await getEMA(client, symbol, '1m', 3)
        const openOrders = await clientExt.futures.openOrders(symbol)
        console.log(openOrders)
        if(ema3 >= ema85) {
            console.log('COMPRA')
            if (openOrders.length === 0) {
                // No hay posiciones, abre una nueva
                await clientExt.futures.marketBuy(symbol, amount)
                // Abre orden de compra ghost
                await clientExt.futures.buy(symbol, 1, 10)
            } else {
                // Si ya existe una orden de compra la liquida
                if (openOrders[0].side !== 'BUY') {
                    await clientExt.futures.cancelAll(symbol)
                    await clientExt.futures.marketSell(obj.symbol, amount, {
                        reduceOnly: true,
                    });
                    await clientExt.futures.marketBuy(symbol, amount)
                    await clientExt.futures.buy(symbol, 1, 10)
                }
            }
        } else {
            console.log('VENTA')
            if (openOrders.length === 0) {
                await clientExt.futures.marketSell(symbol, amount)
                await clientExt.futures.sell(symbol, 0.02, ticker * 10000)
            } else {
                if (openOrders[0].side !== 'SELL') {
                    await clientExt.futures.cancelAll(symbol)
                    await clientExt.futures.marketBuy(obj.symbol, amount, {
                        reduceOnly: true,
                    });
                    await clientExt.futures.marketSell(symbol, amount)
                    await clientExt.futures.sell(symbol, 0.02, ticker * 10000)
                }
            }
        }
    } catch (e) {
        console.info('Error', e)
    }
    
}

const run = () => {
    const config = {
        asset: 'BNB',
        base: 'BUSD',
        allocation: 0.1,
        tickInterval: 20000,
        amount: 0.04
    }

    const binanceClient = Binance({
        apiKey: process.env.API_KEY,
        apiSecret: process.env.API_SECRET
    });

    const binanceExtClient = BinanceExt({
        APIKEY: process.env.API_KEY,
        APISECRET: process.env.API_SECRET
    })

    tick(config, binanceClient, binanceExtClient)
    setInterval(tick, config.tickInterval, config, binanceClient, binanceExtClient)
}

run()