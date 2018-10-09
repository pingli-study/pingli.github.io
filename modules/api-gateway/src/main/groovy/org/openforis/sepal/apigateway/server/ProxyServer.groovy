package org.openforis.sepal.apigateway.server

import io.undertow.Undertow
import io.undertow.UndertowOptions
import io.undertow.server.handlers.StuckThreadDetectionHandler
import org.openforis.sepal.undertow.ExchangeReportingHandler
import org.xnio.Options

class ProxyServer {
    private Undertow server
    private final RootHandler rootHandler
    private final ExchangeReportingHandler exchangeReportingHandler

    ProxyServer(ProxyConfig config) {
        def sslContext = SslContextFactory.create(config.keyFile, config.certificateFile)
        rootHandler = new RootHandler(config)
        exchangeReportingHandler = new ExchangeReportingHandler(
            new StuckThreadDetectionHandler(
                rootHandler
            )
        )
        def processorCount = Runtime.getRuntime().availableProcessors()
        server = Undertow.builder()
                .addHttpListener(config.httpPort, '0.0.0.0')
                .addHttpsListener(config.httpsPort, '0.0.0.0', sslContext)
                .setHandler(exchangeReportingHandler)
                .setIoThreads(processorCount)
                .setWorkerThreads(processorCount * 32)
                .setSocketOption(Options.WRITE_TIMEOUT, 30 * 1000)
                .setServerOption(UndertowOptions.REQUEST_PARSE_TIMEOUT, 30 * 1000)
                .setServerOption(UndertowOptions.NO_REQUEST_TIMEOUT, 30 * 1000)
                .setServerOption(UndertowOptions.IDLE_TIMEOUT, 30 * 1000)
                .build()
        config.endpointConfigs.each { proxy(it) }
    }

    ProxyServer proxy(EndpointConfig endpointConfig) {
        rootHandler.proxy(endpointConfig)
        return this
    }

    ProxyServer start() {
        server.start()
        exchangeReportingHandler.scheduleReport()
        return this
    }

    void stop() {
        server?.stop()
        exchangeReportingHandler?.stop()
    }
}
