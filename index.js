require('dotenv').config()
const ema = require('exponential-moving-average');
const BinanceExt = require('node-binance-api-ext')
const Binance = require('binance-api-node').default

const getEMA = async (client, symbol, interval, limit) => {
    const ticks = await client.futuresCandles({ symbol, interval, limit })
    const closeTicks = ticks.map(tick => tick.close)
    return ema(closeTicks, limit)
}

const getAmount = async (clientExt, markPrice) => {
    const balance = await clientExt.futures.balance()
    const BUSDAV = balance.BUSD.available
    const amountFlot = (BUSDAV / Number(markPrice)) - ((BUSDAV / Number(markPrice)) / 10)
    return amountFlot.toFixed(2)
}

const tick = async (config, client, clientExt) => {
    const { asset, base } = config;
    const symbol = `${asset}${base}`
    try {
        const markPriceResponse = await clientExt.futures.markPrice(symbol)
        const markPrice = markPriceResponse.indexPrice
        const markPriceFixed = Number(markPrice).toFixed(2)
        const minBUSDToTrade = 0.51
        if (await getAmount(clientExt, markPrice) > 0) {
            const ema85 = await getEMA(client, symbol, '1m', 40)
            const ema1 = await getEMA(client, symbol, '1m', 1)
            const openOrders = await clientExt.futures.openOrders(symbol)
            let amount = await getAmount(clientExt, markPrice)
            if (ema1 >= ema85) {
                if (openOrders.length === 0) {
                    console.log('Creando LONG Ghost...')
                    await clientExt.futures.buy(symbol, minBUSDToTrade, 10)
                    console.log('Ghost creado exitosamente')
                    // No hay posiciones, abre una nueva
                    console.log('Ejecutando LONG...')
                    await clientExt.futures.marketBuy(symbol, amount)
                    console.log('LONG inicial exitoso')
                    console.log('###################################')
                } else {
                    // Si ya existe una orden de compra la liquida
                    if (openOrders[0].side !== 'BUY') {
                        console.log('Intentando liquidar ordenes SHORT...')
                        try {
                            await clientExt.futures.marketBuy(symbol, amount, {
                                reduceOnly: true,
                            });
                        } catch {
                            await clientExt.futures.marketSell(symbol, amount, {
                                reduceOnly: true,
                            });
                        }
                        console.log('Ordenes SHORT liquidadas')
                        console.log('Cancelando ordenes ghost...')
                        await clientExt.futures.cancelAll(symbol)
                        console.log('Ghosts cancelados')
                        console.log('Creando Ghost...')
                        await clientExt.futures.buy(symbol, minBUSDToTrade, 10)
                        console.log('Ghost LONG creado exitosamente')
                        amount = await getAmount(clientExt, markPrice)
                        console.log('Ejecutando LONG...')
                        await clientExt.futures.marketBuy(symbol, amount)
                        console.log('LONG exitoso')
                        console.log('###################################')
                    }
                }
            } else {
                if (openOrders.length === 0) {
                    console.log('Creando SHORT Ghost...')
                    await clientExt.futures.sell(symbol, 0.01, markPriceFixed * 2)
                    console.log('Ghost creado exitosamente')
                    console.log('Ejecutando SHORT...')
                    await clientExt.futures.marketSell(symbol, amount)
                    console.log('SHORT inicial exitoso')
                    console.log('###################################')
                } else {
                    if (openOrders[0].side !== 'SELL') {
                        console.log('Intentando liquidar ordenes LONG...')
                        try {
                            await clientExt.futures.marketSell(symbol, amount, {
                                reduceOnly: true,
                            });
                        } catch {
                            await clientExt.futures.marketBuy(symbol, amount, {
                                reduceOnly: true,
                            });
                        }
                        console.log('Ordenes LONG liquidadas')
                        console.log('Cancelando ordenes ghost...')
                        await clientExt.futures.cancelAll(symbol)
                        console.log('Ghosts cancelados')
                        console.log('Creando SHORT Ghost...')
                        await clientExt.futures.sell(symbol, 0.01, markPriceFixed * 2)
                        console.log('Ghost creado exitosamente')
                        amount = await getAmount(clientExt, markPrice)
                        console.log('Ejecutando SHORT...')
                        await clientExt.futures.marketSell(symbol, amount)
                        console.log('SHORT exitoso')
                        console.log('###################################')
                    }
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
        tickInterval: 5000
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