PKGS := gtk+-3.0 ayatana-appindicator3-0.1 json-glib-1.0
CFLAGS += -std=c11 -Wall -Wextra -Werror -O2 $(shell pkg-config --cflags $(PKGS))
LDLIBS += $(shell pkg-config --libs $(PKGS))

.PHONY: all clean test integration-test

all: build/agentlog-tray

build/agentlog-tray: src/main.c
	@mkdir -p build
	$(CC) $(CFLAGS) -Wl,-rpath,'$$ORIGIN/../lib' -o $@ $< $(LDLIBS)

build/protocol-test: src/main.c test/protocol-test.c
	@mkdir -p build
	$(CC) $(CFLAGS) -DAGENTLOG_TRAY_TEST -o $@ $^ $(LDLIBS)

build/status-notifier-host: test/status-notifier-host.c
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $< $(LDLIBS)

test: build/protocol-test
	./build/protocol-test

integration-test: build/agentlog-tray build/status-notifier-host
	xvfb-run -a dbus-run-session -- ./test/dbus-integration.sh

clean:
	rm -rf build
