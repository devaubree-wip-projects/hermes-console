FROM golang:1.26-alpine AS build

WORKDIR /src/apps/gateway
COPY apps/gateway/go.mod apps/gateway/go.sum ./
COPY packages/shared/gatewaycontracts /src/packages/shared/gatewaycontracts
RUN go mod download
COPY apps/gateway ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/hermes-gateway ./cmd/hermes-gateway

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/hermes-gateway /usr/local/bin/hermes-gateway
ENTRYPOINT ["/usr/local/bin/hermes-gateway"]
