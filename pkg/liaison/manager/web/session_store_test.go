package web

import (
	"context"
	"testing"
)

func TestWebSSHSessionStoreCloseByProxy(t *testing.T) {
	store := newWebSSHSessionStore()
	matching, err := store.create(1, 10, "root", []byte("secret"), 80, 24, false, false)
	if err != nil {
		t.Fatal(err)
	}
	other, err := store.create(1, 11, "root", []byte("keep"), 80, 24, false, false)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	store.registerActive(10, "active-10", cancel)

	store.closeByProxy(10)

	select {
	case <-ctx.Done():
	default:
		t.Fatal("active webssh session was not canceled")
	}
	if _, ok := store.consume(matching.token); ok {
		t.Fatal("pending webssh session for closed proxy was not removed")
	}
	if got, ok := store.consume(other.token); !ok || got.proxyID != 11 {
		t.Fatal("pending webssh session for another proxy was removed")
	}
}

func TestWebDesktopSessionStoreCloseByProxy(t *testing.T) {
	store := newWebDesktopSessionStore()
	matching, err := store.create(1, 20, "rdp", "user", "", []byte("secret"), 1024, 768, 96, false, false)
	if err != nil {
		t.Fatal(err)
	}
	other, err := store.create(1, 21, "rdp", "user", "", []byte("keep"), 1024, 768, 96, false, false)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	store.registerActive(20, "active-20", cancel)

	store.closeByProxy(20)

	select {
	case <-ctx.Done():
	default:
		t.Fatal("active webdesktop session was not canceled")
	}
	if _, ok := store.consume(matching.token); ok {
		t.Fatal("pending webdesktop session for closed proxy was not removed")
	}
	if got, ok := store.consume(other.token); !ok || got.proxyID != 21 {
		t.Fatal("pending webdesktop session for another proxy was removed")
	}
}

func TestWebDataSessionStoreCloseByProxy(t *testing.T) {
	store := newWebDataSessionStore()
	matching, err := store.create(&webDataSession{userID: 1, proxyID: 30})
	if err != nil {
		t.Fatal(err)
	}
	other, err := store.create(&webDataSession{userID: 1, proxyID: 31})
	if err != nil {
		t.Fatal(err)
	}

	store.closeByProxy(30)

	if _, ok := store.get(matching.token); ok {
		t.Fatal("webdata session for closed proxy was not removed")
	}
	if got, ok := store.get(other.token); !ok || got.proxyID != 31 {
		t.Fatal("webdata session for another proxy was removed")
	}
}
