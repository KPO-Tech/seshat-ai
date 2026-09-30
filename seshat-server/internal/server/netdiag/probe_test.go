package netdiag

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func stepByName(steps []Step, name string) (Step, bool) {
	for _, s := range steps {
		if s.Name == name {
			return s, true
		}
	}
	return Step{}, false
}

func TestProbeHTTPSuccessAgainstRealServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result := ProbeHTTP(context.Background(), "test target", server.URL, "/")
	if !result.OK {
		t.Fatalf("expected overall success, got %+v", result)
	}
	tlsStep, ok := stepByName(result.Steps, "tls")
	if !ok || tlsStep.Status != StatusSkipped {
		t.Fatalf("expected tls to be skipped for a plain HTTP target, got %+v", tlsStep)
	}
}

func TestProbeHTTPSucceedsOnNon2xxStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer server.Close()

	result := ProbeHTTP(context.Background(), "test target", server.URL, "/")
	httpStep, ok := stepByName(result.Steps, "http")
	if !ok || httpStep.Status != StatusPass {
		t.Fatalf("expected the http step to still pass on a non-2xx response (an IdP's SSO endpoint often rejects a bare GET), got %+v", httpStep)
	}
}

func TestProbeHTTPFailsDNSForInvalidHost(t *testing.T) {
	result := ProbeHTTP(context.Background(), "test target", "http://this-host-does-not-exist.invalid", "/")
	if result.OK {
		t.Fatal("expected overall failure for an unresolvable host")
	}
	dnsStep, ok := stepByName(result.Steps, "dns")
	if !ok || dnsStep.Status != StatusFail || dnsStep.ActOn != ActOnNetworkAdmin {
		t.Fatalf("expected dns to fail with a network_admin suggestion, got %+v", dnsStep)
	}
}

func TestProbeTCPSuccessAgainstRealListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			conn.Close()
		}
	}()

	host, portStr, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("split host port: %v", err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	result := ProbeTCP(context.Background(), "SMTP relay", host, port)
	if !result.OK {
		t.Fatalf("expected overall success, got %+v", result)
	}
	if _, ok := stepByName(result.Steps, "tls"); ok {
		t.Fatal("expected no tls step for a TCP-only probe")
	}
	if _, ok := stepByName(result.Steps, "http"); ok {
		t.Fatal("expected no http step for a TCP-only probe")
	}
}

func TestProbeTCPFailsForClosedPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := listener.Addr().String()
	listener.Close()
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatalf("split host port: %v", err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	result := ProbeTCP(context.Background(), "SMTP relay", host, port)
	if result.OK {
		t.Fatal("expected overall failure for a closed port")
	}
	tcpStep, ok := stepByName(result.Steps, "tcp")
	if !ok || tcpStep.Status != StatusFail || tcpStep.ActOn != ActOnNetworkAdmin {
		t.Fatalf("expected tcp to fail with a network_admin suggestion, got %+v", tcpStep)
	}
}
