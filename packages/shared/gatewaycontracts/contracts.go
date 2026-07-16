package gatewaycontracts

import (
	_ "embed"
	"encoding/json"
)

type Paths struct {
	Capabilities   string `json:"capabilities"`
	Preflight      string `json:"preflight"`
	RuntimePrefix  string `json:"runtimePrefix"`
	GatewayControl string `json:"gatewayControl"`
	ProfileTest    string `json:"profileTest"`
	BackupControl  string `json:"backupControl"`
	UpgradeControl string `json:"upgradeControl"`
	RevokeControl  string `json:"revokeControl"`
	Websocket      string `json:"websocket"`
}

type ServiceHeaders struct {
	Timestamp    string `json:"timestamp"`
	Nonce        string `json:"nonce"`
	Signature    string `json:"signature"`
	Profile      string `json:"profile"`
	Installation string `json:"installation"`
	RequestID    string `json:"requestId"`
}

type WorkPaths struct {
	Claim            string `json:"claim"`
	RunStart         string `json:"runStart"`
	RunHeartbeat     string `json:"runHeartbeat"`
	RunEvents        string `json:"runEvents"`
	RunInterventions string `json:"runInterventions"`
	RunComplete      string `json:"runComplete"`
	RunRelease       string `json:"runRelease"`
}

type WorkContract struct {
	ProtocolVersion int       `json:"protocolVersion"`
	Paths           WorkPaths `json:"paths"`
}

type Contract struct {
	ProtocolVersion int            `json:"protocolVersion"`
	Paths           Paths          `json:"paths"`
	ServiceHeaders  ServiceHeaders `json:"serviceHeaders"`
	Work            WorkContract   `json:"work"`
}

//go:embed gateway.json
var raw []byte

var Spec = mustLoad()

func mustLoad() Contract {
	var contract Contract
	if err := json.Unmarshal(raw, &contract); err != nil {
		panic(err)
	}
	return contract
}
