module github.com/lfmororo/vigilant-web-haven/agent

go 1.22

replace golang.org/x/sys => github.com/golang/sys v0.30.0

replace golang.org/x/net => github.com/golang/net v0.35.0

replace golang.org/x/text => github.com/golang/text v0.22.0

replace golang.org/x/crypto => github.com/golang/crypto v0.33.0

replace golang.org/x/sync => github.com/golang/sync v0.11.0

replace golang.org/x/term => github.com/golang/term v0.29.0

replace golang.org/x/image => github.com/golang/image v0.24.0

replace golang.org/x/mod => github.com/golang/mod v0.23.0

replace golang.org/x/tools => github.com/golang/tools v0.30.0

require (
	github.com/kardianos/service v1.2.2
	github.com/microsoft/go-mssqldb v1.8.0
	github.com/shirou/gopsutil/v4 v4.25.1
	github.com/yusufpapurcu/wmi v1.2.4
	golang.org/x/crypto v0.33.0
	golang.org/x/image v0.24.0
	golang.org/x/net v0.35.0
	golang.org/x/sys v0.30.0
)

require (
	github.com/go-ole/go-ole v1.2.6 // indirect
	github.com/golang-sql/civil v0.0.0-20220223132316-b832511892a9 // indirect
	github.com/golang-sql/sqlexp v0.1.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/tklauser/go-sysconf v0.3.12 // indirect
	github.com/tklauser/numcpus v0.6.1 // indirect
	golang.org/x/text v0.22.0 // indirect
)

replace golang.org/x/xerrors => github.com/golang/xerrors v0.0.0-20231012003039-104605ab7028

replace golang.org/x/oauth2 => github.com/golang/oauth2 v0.26.0

replace golang.org/x/exp => github.com/golang/exp v0.0.0-20250210185358-939b2ce775ac
