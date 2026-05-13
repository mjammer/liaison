package web

import (
	"bufio"
	"strings"
	"testing"
	"time"
)

func TestWebDesktopSessionStoreConsumesOnceAndExpires(t *testing.T) {
	store := newWebDesktopSessionStore()
	session, err := store.create(1, 2, "rdp", "alice", "corp", []byte("secret"), 800, 600, 96, true, false)
	if err != nil {
		t.Fatalf("create() error = %v", err)
	}
	if got, ok := store.consume(session.token); !ok || got == nil {
		t.Fatal("consume() did not return created session")
	}
	if _, ok := store.consume(session.token); ok {
		t.Fatal("consume() returned the same token twice")
	}

	expired, err := store.create(1, 2, "vnc", "", "", []byte("secret"), 800, 600, 96, false, false)
	if err != nil {
		t.Fatalf("create() expired error = %v", err)
	}
	expired.expiresAt = time.Now().Add(-time.Second)
	if _, ok := store.consume(expired.token); ok {
		t.Fatal("consume() returned an expired token")
	}
}

func TestGuacamoleInstructionRoundTrip(t *testing.T) {
	raw := formatGuacInstruction("connect", "VERSION_1_5_0", "127.0.0.1", "3389", "alice")
	inst, err := readGuacInstruction(bufio.NewReader(strings.NewReader(raw)))
	if err != nil {
		t.Fatalf("readGuacInstruction() error = %v", err)
	}
	if inst.Raw != raw {
		t.Fatalf("raw instruction = %q, want %q", inst.Raw, raw)
	}
	if inst.Opcode != "connect" || len(inst.Args) != 4 || inst.Args[3] != "alice" {
		t.Fatalf("instruction = %#v", inst)
	}
}

func TestGuacamoleTunnelInternalMessageDetection(t *testing.T) {
	internalPing := formatGuacInstruction("", "ping", "1715500000000")
	if !isGuacamoleTunnelInternalMessage([]byte(internalPing)) {
		t.Fatalf("internal ping was not detected: %q", internalPing)
	}

	normalNOP := formatGuacInstruction("nop")
	if isGuacamoleTunnelInternalMessage([]byte(normalNOP)) {
		t.Fatalf("normal instruction detected as internal: %q", normalNOP)
	}
}

func TestNormalizeWebDesktopSize(t *testing.T) {
	width, height, dpi := normalizeWebDesktopSize(0, 0, 0)
	if width != webDesktopDefaultWidth || height != webDesktopDefaultHeight || dpi != webDesktopDefaultDPI {
		t.Fatalf("defaults = %dx%d@%d", width, height, dpi)
	}
	width, height, dpi = normalizeWebDesktopSize(9000, 5000, 300)
	if width != 7680 || height != 4320 || dpi != 240 {
		t.Fatalf("clamped = %dx%d@%d", width, height, dpi)
	}
}
