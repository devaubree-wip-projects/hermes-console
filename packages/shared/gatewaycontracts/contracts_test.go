package gatewaycontracts

import "testing"

func TestCanonicalGatewayContract(t *testing.T) {
	if Spec.ProtocolVersion != 1 || Spec.Paths.Websocket != "/v1/ws" {
		t.Fatalf("unexpected gateway contract: %#v", Spec)
	}
	if Spec.ServiceHeaders.Signature != "X-Hermes-Signature" {
		t.Fatalf("unexpected signature header: %s", Spec.ServiceHeaders.Signature)
	}
	if Spec.Work.ProtocolVersion != 1 || Spec.Work.Paths.Claim != "/api/runtime/work/claim" {
		t.Fatalf("unexpected Work contract: %#v", Spec.Work)
	}
}
