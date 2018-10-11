package org.openforis.sepal.component.sandboxwebproxy

import io.undertow.server.HttpServerExchange
import io.undertow.server.handlers.ResponseCodeHandler
import io.undertow.server.handlers.proxy.PatchedLoadBalancingProxyClient
import org.openforis.sepal.undertow.PatchedProxyHandler
import org.xnio.OptionMap
import org.xnio.Options

class Endpoint {
    final String username
    final String name
    final URI uri
    final String sandboxSessionId
    final PatchedProxyHandler proxyHandler
    final PatchedLoadBalancingProxyClient proxyClient

    Endpoint(String name, String username, URI uri, String sandboxSessionId) {
        this.name = name
        this.username = username
        this.uri = uri
        this.sandboxSessionId = sandboxSessionId
        proxyClient = new PatchedLoadBalancingProxyClient(
            maxQueueSize: 4096,
            connectionsPerThread: 20,
            softMaxConnectionsPerThread: 10,
            ttl: 40 * 1000
        )
        OptionMap options = OptionMap.builder().set(Options.KEEP_ALIVE, true).map
        proxyClient.addHost(null, uri, null, null, options)
        proxyHandler = PatchedProxyHandler.builder()
            .setMaxRequestTime(2 * 60 * 60 * 1000) // Two hours
            .setProxyClient(proxyClient)
            .setNext(ResponseCodeHandler.HANDLE_404)
            .build()
    }

    void forward(HttpServerExchange exchange) {
        proxyHandler.handleRequest(exchange)
    }

    void close() {
        proxyClient.removeHost(uri)
    }

    String getSandboxHost() {
        uri.host
    }

    String toString() {
        return "Endpoint{" +
            "username='" + username + '\'' +
            ", name='" + name + '\'' +
            ", uri=" + uri +
            ", sandboxSessionId='" + sandboxSessionId + '\'' +
            '}'
    }
}