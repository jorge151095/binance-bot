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

const getMarkPrice = async (clientExt, symbol) => {
    const markPriceResponse = await clientExt.futures.markPrice(symbol)
    return markPrice = markPriceResponse.indexPrice
}

const resetTransaction = (price) => {
    return {
        price,
        isAlreadyRebased: false,
        orderAlreadyliquidated: false
    }
}
const tick = async (config, client, clientExt, previousTransaction) => {
    const { asset, base, amount, markPrice, tickInterval } = config;
    let delay = tickInterval
    const symbol = `${asset}${base}`
    let transaction = {
        price: previousTransaction.price,
        isAlreadyRebased: previousTransaction.isAlreadyRebased,
        orderAlreadyliquidated: previousTransaction.orderAlreadyliquidated
    }
    try {
        const markPriceFixed = Number(markPrice).toFixed(2)
        const minBUSDToTrade = 0.51
        if (amount > 0) {
            const ema85 = await getEMA(client, symbol, '1m', 40)
            const ema1 = await getEMA(client, symbol, '1m', 1)
            const openOrders = await clientExt.futures.openOrders(symbol)
            if (ema1 >= ema85) {
                if (openOrders.length === 0) {
                    console.log(`Creando LONG Ghost. Cantidad BNB: ${minBUSDToTrade}`)
                    await clientExt.futures.buy(symbol, minBUSDToTrade, 10)
                    console.log('Ghost creado exitosamente')
                    // No hay posiciones, abre una nueva
                    console.log(`Ejecutando LONG con ${amount}...`)
                    await clientExt.futures.marketBuy(symbol, amount)
                    transaction = {...resetTransaction(ema1)}
                    console.log(`LONG inicial exitoso. Precio ${transaction.price}`)
                    console.log('###################################')
                } else {
                    // Si ya existe una orden de compra la liquida
                    if (openOrders[0].side !== 'BUY') {
                        console.log(`Intentando liquidar ordenes SHORT. Cantidad BNB: ${amount}`)
                        try {
                            await clientExt.futures.marketBuy(symbol, amount, {
                                reduceOnly: true,
                            });
                        } catch {
                            try {
                                await clientExt.futures.marketSell(symbol, amount, {
                                    reduceOnly: true,
                                });
                            } catch {}
                        }
                        console.log('Ordenes SHORT liquidadas')
                        console.log('Cancelando ordenes LONG ghost...')
                        await clientExt.futures.cancelAll(symbol)
                        console.log('Ghosts cancelados')
                        console.log(`Creando LONG Ghost. Cantidad BNB: ${minBUSDToTrade}`)
                        await clientExt.futures.buy(symbol, minBUSDToTrade, 10)
                        console.log('Ghost LONG creado exitosamente')
                        console.log(`Ejecutando LONG con ${amount}...`)
                        await clientExt.futures.marketBuy(symbol, amount)
                        transaction = {...resetTransaction(ema1)}
                        console.log(`LONG exitoso. Precio ${transaction.price}`)
                        console.log('###################################')
                    } else {
                        if (transaction.price && ema1 > transaction.price * 1.0005 && !transaction.isAlreadyRebased) {
                            transaction.isAlreadyRebased = true
                            console.log('----------------')
                            console.log(`Limite PNL LONG alcanzado. Precio ${ema1}`)
                            console.log('----------------')
                        } else if (transaction.price && ema1 <= transaction.price * 1.0005 && transaction.isAlreadyRebased && !transaction.orderAlreadyliquidated) {
                            console.log(`Limite PNL LONG alcanzado. Intentando liquidar ordenes LONG por límite. Cantidad BNB: ${amount}`)
                            try {
                                await clientExt.futures.marketSell(symbol, amount, {
                                    reduceOnly: true,
                                });
                            } catch {
                                await clientExt.futures.marketBuy(symbol, amount, {
                                    reduceOnly: true,
                                });
                            }
                            transaction.orderAlreadyliquidated = true
                            console.log('Ordenes LONG liquidadas por límite')
                        }
                    }
                }
            } else {
                if (openOrders.length === 0) {
                    console.log(`Creando SHORT Ghost. Cantidad: 0.01`)
                    await clientExt.futures.sell(symbol, 0.01, markPriceFixed * 2)
                    console.log('Ghost creado exitosamente')
                    console.log(`Ejecutando SHORT con ${amount}...`)
                    await clientExt.futures.marketSell(symbol, amount)
                    transaction = {...resetTransaction(ema1)}
                    console.log(`SHORT inicial exitoso. Precio ${transaction.price}`)
                    console.log('###################################')
                } else {
                    if (openOrders[0].side !== 'SELL') {
                        console.log(`Intentando liquidar ordenes LONG. Cantidad BNB: ${amount}`)
                        try {
                            await clientExt.futures.marketSell(symbol, amount, {
                                reduceOnly: true,
                            });
                        } catch {
                            try {
                                await clientExt.futures.marketBuy(symbol, amount, {
                                reduceOnly: true,
                            }); 
                            } catch {}
                        }
                        console.log('Ordenes LONG liquidadas')
                        console.log('Cancelando ordenes SHORT ghost...')
                        await clientExt.futures.cancelAll(symbol)
                        console.log('Ghosts cancelados')
                        console.log(`Creando SHORT Ghost. Cantidad BNB: 0.01`)
                        await clientExt.futures.sell(symbol, 0.01, markPriceFixed * 2)
                        console.log('Ghost creado exitosamente')
                        console.log(`Ejecutando SHORT con ${amount}...`)
                        await clientExt.futures.marketSell(symbol, amount)
                        transaction = {...resetTransaction(ema1)}
                        console.log(`SHORT exitoso. Precio ${transaction.price}`)
                        console.log('###################################')
                    } else {
                        if (transaction.price && ema1 < (transaction.price - transaction.price * 0.0005) && !transaction.isAlreadyRebased) {
                            transaction.isAlreadyRebased = true
                            console.log('----------------')
                            console.log(`Limite PNL SHORT alcanzado. Precio ${ema1}`)
                            console.log('----------------')
                        } else if (transaction.price && ema1 >= (transaction.price - transaction.price * 0.0005) && transaction.isAlreadyRebased && !transaction.orderAlreadyliquidated) {
                            console.log(`Limite PNL SHORT alcanzado. Intentando liquidar ordenes SHORT por límite. Cantidad BNB: ${amount}`)
                            try {
                                await clientExt.futures.marketBuy(symbol, amount, {
                                    reduceOnly: true,
                                });
                            } catch {
                                await clientExt.futures.marketSell(symbol, amount, {
                                    reduceOnly: true,
                                });
                            }
                            transaction.orderAlreadyliquidated = true
                            console.log('Ordenes SHORT liquidadas por límite')
                        }
                    }
                }
            }
            delay = 0
        }
    } catch (e) {
        console.info('Error', e)
        delay = 0
    }
    setTimeout(() => tick(config, client, clientExt, transaction), delay);
}

const run = async () => {
    

    const binanceClient = Binance({
        apiKey: process.env.API_KEY,
        apiSecret: process.env.API_SECRET
    });

    const binanceExtClient = BinanceExt({
        APIKEY: process.env.API_KEY,
        APISECRET: process.env.API_SECRET
    })

    const asset = 'BNB'
    const base = 'BUSD'

    const markPrice = await getMarkPrice(binanceExtClient, `${asset}${base}`)
    const config = {
        asset,
        base,
        tickInterval: 1000,
        amount: await getAmount(binanceExtClient, markPrice),
        markPrice
    }

    const intialTransaction = {
        price: undefined,
        isAlreadyRebased: false,
        orderAlreadyliquidated: false
    }
    tick(config, binanceClient, binanceExtClient, intialTransaction)
}

run()