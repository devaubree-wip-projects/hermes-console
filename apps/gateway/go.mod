module github.com/MakFly/hermes-console/apps/gateway

go 1.26.0

require (
	github.com/MakFly/hermes-console/packages/shared/gatewaycontracts v0.0.0
	github.com/fsnotify/fsnotify v1.9.0
	github.com/gorilla/websocket v1.5.3
)

require golang.org/x/sys v0.13.0 // indirect

replace github.com/MakFly/hermes-console/packages/shared/gatewaycontracts => ../../packages/shared/gatewaycontracts
