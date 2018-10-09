package org.openforis.sepal.undertow

import groovy.json.JsonOutput
import io.undertow.server.ExchangeCompletionListener
import io.undertow.server.HttpHandler
import io.undertow.server.HttpServerExchange
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalUnit
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

import static java.util.concurrent.Executors.newSingleThreadScheduledExecutor
import static org.openforis.sepal.util.NamedThreadFactory.singleThreadFactory

class ExchangeReportingHandler implements HttpHandler {
    private final static Logger LOG = LoggerFactory.getLogger(this)

    private final ScheduledExecutorService executor =
        newSingleThreadScheduledExecutor(singleThreadFactory('ExchangeReportingExecutor'))
    private final HttpHandler next
    private final Map<HttpServerExchange, Long> startTimeByExchange = new ConcurrentHashMap<>()

    ExchangeReportingHandler(HttpHandler next) {
        this.next = next
    }

    void handleRequest(HttpServerExchange exchange) throws Exception {
        if (!exchange.isComplete()) {
            startTimeByExchange[exchange] = System.currentTimeMillis()

            exchange.addExchangeCompleteListener(new ExchangeCompletionListener() {
                void exchangeEvent(HttpServerExchange e, ExchangeCompletionListener.NextListener nextListener) {
                    startTimeByExchange.remove(exchange)
                    nextListener.proceed()
                }
            })
        }
        next.handleRequest(exchange)
    }

    List<Map> exchangesOlderThan(long maxAge, TemporalUnit temporalUnit) {
        startTimeByExchange.entrySet().toList()
            .collect { [exchange: it.key, startTime: it.value, foo: it.key.isInIoThread()] }
            .findAll {
            def duration = Duration.of(maxAge, temporalUnit)
            def now = Instant.ofEpochMilli(System.currentTimeMillis())
            def latestToGet = now - duration
            def exchangeStartTime = Instant.ofEpochMilli(it.startTime as long)
            return exchangeStartTime.isBefore(latestToGet)
        }
    }

    void scheduleReport() {
        LOG.info('Scheduling exchange report')
        executor.scheduleWithFixedDelay({
            try {
                def exchanges = exchangesOlderThan(60, ChronoUnit.SECONDS)
                if (exchanges.empty)
                    return
                LOG.warn(JsonOutput.toJson(exchanges.collect {
                    def exchange = it.exchange as HttpServerExchange
                    [
                        request: "${exchange.requestMethod} ${exchange.requestPath}",
                        start: new Date(it.startTime).format('yyyy-MM-dd hh:mm:ss'),
                        duration: (System.currentTimeMillis() - it.startTime) / 1000,
                        dispatched: exchange.isDispatched(),
                        inIoThread: exchange.isInIoThread(),
                        requestChannelAvailable: exchange.isRequestChannelAvailable(),
                        responseChannelAvailable: exchange.isResponseChannelAvailable(),
                        responseStarted: exchange.isResponseStarted(),
                        requestComplete: exchange.isRequestComplete(),
                        responseComplete: exchange.isResponseComplete(),
                        complete: exchange.isComplete(),
                    ]
                }))
            } catch (Exception e) {
                LOG.error('Failed to get exchange report', e)
            }
        } as Runnable, 0, 60, TimeUnit.SECONDS)
    }

    void stop() {
        executor.shutdown()
    }
}
