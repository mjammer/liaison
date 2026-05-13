package trafficconn

import (
	"net"
	"sync"
	"sync/atomic"
	"time"
)

const defaultFlushInterval = time.Second

// Recorder receives byte deltas for a proxy/application pair.
type Recorder interface {
	RecordTraffic(proxyID, applicationID uint, bytesIn, bytesOut int64)
}

// RecorderFunc adapts a function to Recorder.
type RecorderFunc func(proxyID, applicationID uint, bytesIn, bytesOut int64)

func (f RecorderFunc) RecordTraffic(proxyID, applicationID uint, bytesIn, bytesOut int64) {
	f(proxyID, applicationID, bytesIn, bytesOut)
}

// Flusher is implemented by recorders that can persist buffered metrics.
type Flusher interface {
	Flush()
}

// TargetConn wraps the TCP stream between Liaison and the target side.
// Reads are target -> client bytes_out; writes are client -> target bytes_in.
func TargetConn(conn net.Conn, recorder Recorder, proxyID, applicationID uint) net.Conn {
	if conn == nil || recorder == nil || proxyID == 0 || applicationID == 0 {
		return conn
	}
	metered := &meteredTargetConn{
		Conn:          conn,
		recorder:      recorder,
		proxyID:       proxyID,
		applicationID: applicationID,
		done:          make(chan struct{}),
	}
	go metered.flushLoop()
	return metered
}

type meteredTargetConn struct {
	net.Conn

	recorder      Recorder
	proxyID       uint
	applicationID uint

	bytesIn  atomic.Int64
	bytesOut atomic.Int64
	done     chan struct{}
	once     sync.Once
}

func (c *meteredTargetConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 {
		c.bytesOut.Add(int64(n))
	}
	if err != nil {
		c.flush()
	}
	return n, err
}

func (c *meteredTargetConn) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	if n > 0 {
		c.bytesIn.Add(int64(n))
	}
	if err != nil {
		c.flush()
	}
	return n, err
}

func (c *meteredTargetConn) Close() error {
	err := c.Conn.Close()
	c.once.Do(func() {
		close(c.done)
		c.flush()
		if flusher, ok := c.recorder.(Flusher); ok {
			flusher.Flush()
		}
	})
	return err
}

func (c *meteredTargetConn) flushLoop() {
	ticker := time.NewTicker(defaultFlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.flush()
		case <-c.done:
			return
		}
	}
}

func (c *meteredTargetConn) flush() {
	bytesIn := c.bytesIn.Swap(0)
	bytesOut := c.bytesOut.Swap(0)
	if bytesIn == 0 && bytesOut == 0 {
		return
	}
	c.recorder.RecordTraffic(c.proxyID, c.applicationID, bytesIn, bytesOut)
}
