import SessionWatermark, {
  buildSessionWatermarkLabel,
  useSessionWatermarkTime,
} from '@/components/SessionWatermark';
import { useI18n } from '@/i18n';
import {
  createWebDesktopSession,
  deleteWebDesktopCredential,
  getWebDesktopTarget,
} from '@/services/api';
import {
  DisconnectOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { useModel, useParams } from '@umijs/max';
import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Form,
  Input,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import Guacamole from 'guacamole-common-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import './index.less';

const { Text } = Typography;

const credentialKey = (username?: string, domain?: string) =>
  `${domain || ''}\\${username || ''}`;

const WebDesktopPage: React.FC = () => {
  const { tr } = useI18n();
  const { initialState } = useModel('@@initialState');
  const params = useParams();
  const proxyId = Number(params.proxyId);
  const [form] = Form.useForm<API.CreateWebDesktopSessionRequest>();
  const watchedUsername = Form.useWatch('username', form);
  const watchedDomain = Form.useWatch('domain', form);
  const [target, setTarget] = useState<API.WebDesktopTarget>();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const displayHostRef = useRef<HTMLDivElement | null>(null);
  const displayContentRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<any>();
  const tunnelRef = useRef<any>();
  const keyboardRef = useRef<any>();
  const mouseRef = useRef<any>();

  const active = target?.effective_status === 'active';
  const protocol = target?.protocol || 'rdp';
  const savedCredentials = target?.credentials || [];
  const selectedSavedCredential = savedCredentials.some(
    (item) =>
      credentialKey(item.username, item.domain) ===
      credentialKey(watchedUsername, watchedDomain),
  );
  const savedOptions = savedCredentials.map((item) => {
    const key = credentialKey(item.username, item.domain);
    const label =
      protocol === 'vnc'
        ? tr('已保存的 VNC 密码', 'Saved VNC password')
        : item.domain
        ? `${item.domain}\\${item.username}`
        : item.username || '';
    return { label, value: key };
  });
  const watermarkTime = useSessionWatermarkTime();
  const watermarkUser =
    initialState?.currentUser?.email ||
    initialState?.currentUser?.name ||
    tr('未知用户', 'Unknown user');
  const watermarkLines = target
    ? [
        buildSessionWatermarkLabel([
          watermarkUser,
          target.protocol.toUpperCase(),
          target.proxy_name,
        ]),
        watermarkTime,
      ]
    : [
        buildSessionWatermarkLabel([watermarkUser, 'WebDesktop']),
        watermarkTime,
      ];

  const cleanupConnection = useCallback(
    (close = false, clearDisplay = false) => {
      const keyboard = keyboardRef.current;
      const mouse = mouseRef.current;
      const client = clientRef.current;
      const tunnel = tunnelRef.current;
      keyboard?.reset?.();
      if (keyboard) {
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
      }
      mouse?.cleanup?.();
      keyboardRef.current = undefined;
      mouseRef.current = undefined;
      clientRef.current = undefined;
      tunnelRef.current = undefined;
      if (close) {
        client?.disconnect?.();
        tunnel?.disconnect?.();
      }
      if (clearDisplay && displayContentRef.current) {
        displayContentRef.current.innerHTML = '';
      }
      setConnected(false);
      setConnecting(false);
    },
    [],
  );

  const disconnect = useCallback(() => {
    cleanupConnection(true, true);
  }, [cleanupConnection]);

  const focusRemoteCanvas = useCallback(() => {
    const canvas = displayContentRef.current?.querySelector<HTMLCanvasElement>(
      '.webdesktop-input-plane',
    );
    canvas?.focus({ preventScroll: true });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const host = displayHostRef.current;
    if (!host || !connected) return;
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen();
        return;
      }
      await host.requestFullscreen();
      window.setTimeout(focusRemoteCanvas, 0);
    } catch (e: any) {
      message.error(
        e?.message || tr('无法进入全屏', 'Unable to enter fullscreen'),
      );
    }
  }, [connected, focusRemoteCanvas, tr]);

  const loadTarget = useCallback(async () => {
    if (!proxyId) {
      setError(tr('访问 ID 无效', 'Invalid entry ID'));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getWebDesktopTarget(proxyId);
      if (res.code === 200 && res.data) {
        setTarget(res.data);
        const credentials = res.data.credentials || [];
        if (credentials.length > 0) {
          const item = credentials[0];
          form.setFieldsValue({
            username: item.username || '',
            domain: item.domain || '',
            password: '',
            save_credential: false,
          });
        } else {
          form.setFieldsValue({ save_credential: false });
        }
        setError('');
      } else {
        setError(
          res.message ||
            tr('获取远程桌面目标失败', 'Failed to load remote desktop target'),
        );
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          tr('获取远程桌面目标失败', 'Failed to load remote desktop target'),
      );
    } finally {
      setLoading(false);
    }
  }, [form, proxyId, tr]);

  useEffect(() => {
    loadTarget();
  }, [loadTarget]);

  useEffect(() => {
    document.body.classList.add('webdesktop-page-active');
    const footerElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.ant-pro-layout-footer, .global-footer',
      ),
    );
    const previousFooterStyles = footerElements.map((element) => ({
      element,
      display: element.style.display,
      pointerEvents: element.style.pointerEvents,
    }));
    footerElements.forEach((element) => {
      element.style.display = 'none';
      element.style.pointerEvents = 'none';
    });
    return () => {
      document.body.classList.remove('webdesktop-page-active');
      previousFooterStyles.forEach(({ element, display, pointerEvents }) => {
        element.style.display = display;
        element.style.pointerEvents = pointerEvents;
      });
    };
  }, []);

  useEffect(
    () => () => {
      disconnect();
    },
    [disconnect],
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === displayHostRef.current;
      setFullscreen(active);
      if (active) {
        window.setTimeout(focusRemoteCanvas, 0);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [focusRemoteCanvas]);

  const applySelectedCredential = (value: string) => {
    const item = savedCredentials.find(
      (candidate) =>
        credentialKey(candidate.username, candidate.domain) === value,
    );
    if (!item) return;
    form.setFieldsValue({
      username: item.username || '',
      domain: item.domain || '',
      password: '',
      save_credential: false,
    });
  };

  const connect = async (values: API.CreateWebDesktopSessionRequest) => {
    if (
      !target ||
      !active ||
      !displayHostRef.current ||
      !displayContentRef.current
    )
      return;
    disconnect();
    setConnecting(true);
    setError('');
    const width = Math.max(displayHostRef.current.clientWidth || 0, 1024);
    const height = Math.max(displayHostRef.current.clientHeight || 0, 640);
    try {
      const password = values.password || '';
      const shouldSaveCredential = Boolean(values.save_credential && password);
      const res = await createWebDesktopSession(proxyId, {
        username: values.username?.trim(),
        domain: values.domain?.trim(),
        password,
        save_credential: shouldSaveCredential,
        width,
        height,
        dpi: 96,
      });
      form.setFieldValue('password', '');
      if (res.code !== 200 || !res.data?.ws_url) {
        throw new Error(
          res.message ||
            tr(
              '创建 WebDesktop 会话失败',
              'Failed to create WebDesktop session',
            ),
        );
      }

      const tunnel = new Guacamole.WebSocketTunnel(res.data.ws_url);
      const client = new Guacamole.Client(tunnel);
      tunnelRef.current = tunnel;
      clientRef.current = client;
      const display = client.getDisplay();
      const displayElement = display.getElement() as HTMLElement;
      const inputPlane = document.createElement('canvas');
      inputPlane.className = 'webdesktop-input-plane';
      inputPlane.tabIndex = 0;
      displayElement.classList.add('webdesktop-native-display');
      displayContentRef.current.innerHTML = '';
      displayContentRef.current.appendChild(displayElement);
      displayContentRef.current.appendChild(inputPlane);

      const fitDisplayToHost = () => {
        const host = displayHostRef.current;
        if (!host) return;
        const remoteWidth = Math.max(
          display.getWidth?.() || inputPlane.width || width,
          1,
        );
        const remoteHeight = Math.max(
          display.getHeight?.() || inputPlane.height || height,
          1,
        );
        const availableWidth = Math.max(host.clientWidth, 1);
        const availableHeight = Math.max(host.clientHeight, 1);
        const scale = Math.min(
          availableWidth / remoteWidth,
          availableHeight / remoteHeight,
        );
        display.scale(scale);
        if (inputPlane.width !== remoteWidth) inputPlane.width = remoteWidth;
        if (inputPlane.height !== remoteHeight)
          inputPlane.height = remoteHeight;
        inputPlane.style.width = `${Math.floor(remoteWidth * scale)}px`;
        inputPlane.style.height = `${Math.floor(remoteHeight * scale)}px`;
      };
      let fitPending = false;
      const scheduleDisplayFit = () => {
        if (fitPending) return;
        fitPending = true;
        window.requestAnimationFrame(() => {
          fitPending = false;
          fitDisplayToHost();
        });
      };
      const resizeObserver =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(scheduleDisplayFit)
          : undefined;
      resizeObserver?.observe(displayHostRef.current);
      window.addEventListener('resize', scheduleDisplayFit);
      fitDisplayToHost();
      display.onresize = (width: number, height: number) => {
        if (inputPlane.width !== width) inputPlane.width = width;
        if (inputPlane.height !== height) inputPlane.height = height;
        scheduleDisplayFit();
      };

      tunnel.onerror = (status: any) => {
        const text =
          status?.message ||
          tr('WebDesktop 连接异常', 'WebDesktop connection error');
        setError(text);
        cleanupConnection(true);
      };
      tunnel.onstatechange = (state: number) => {
        if (state === Guacamole.Tunnel.State.OPEN) {
          setConnecting(false);
          setConnected(true);
          inputPlane.focus({ preventScroll: true });
          if (shouldSaveCredential) {
            window.setTimeout(loadTarget, 1000);
          }
        }
        if (state === Guacamole.Tunnel.State.CLOSED) {
          cleanupConnection(false);
        }
      };
      client.onerror = (status: any) => {
        const text =
          status?.message ||
          tr('远程桌面连接失败', 'Remote desktop connection failed');
        setError(text);
        cleanupConnection(true);
      };

      const mouseState = {
        x: 0,
        y: 0,
        left: false,
        middle: false,
        right: false,
        up: false,
        down: false,
      };
      const sendMouseStateNow = () => {
        if (clientRef.current !== client) return;
        client.sendMouseState({ ...mouseState });
      };
      const updateMousePosition = (event: MouseEvent | WheelEvent) => {
        const rect = inputPlane.getBoundingClientRect();
        const visibleWidth = rect.width || inputPlane.width || 1;
        const visibleHeight = rect.height || inputPlane.height || 1;
        const x =
          ((event.clientX - rect.left) * inputPlane.width) / visibleWidth;
        const y =
          ((event.clientY - rect.top) * inputPlane.height) / visibleHeight;
        mouseState.x = Math.max(
          0,
          Math.min(inputPlane.width - 1, Math.round(x)),
        );
        mouseState.y = Math.max(
          0,
          Math.min(inputPlane.height - 1, Math.round(y)),
        );
      };
      const updateButton = (event: MouseEvent, pressed: boolean) => {
        if (event.button === 0) mouseState.left = pressed;
        if (event.button === 1) mouseState.middle = pressed;
        if (event.button === 2) mouseState.right = pressed;
      };
      const handleMouseMove = (event: MouseEvent) => {
        event.preventDefault();
        updateMousePosition(event);
        sendMouseStateNow();
      };
      const handlePointerDown = (event: PointerEvent) => {
        inputPlane.setPointerCapture?.(event.pointerId);
      };
      const handlePointerUp = (event: PointerEvent) => {
        inputPlane.releasePointerCapture?.(event.pointerId);
      };
      const handleMouseDown = (event: MouseEvent) => {
        event.preventDefault();
        inputPlane.focus({ preventScroll: true });
        updateMousePosition(event);
        updateButton(event, true);
        sendMouseStateNow();
      };
      const handleMouseUp = (event: MouseEvent) => {
        event.preventDefault();
        updateMousePosition(event);
        updateButton(event, false);
        sendMouseStateNow();
      };
      const handleMouseLeave = () => {
        mouseState.left = false;
        mouseState.middle = false;
        mouseState.right = false;
        mouseState.up = false;
        mouseState.down = false;
        sendMouseStateNow();
      };
      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        updateMousePosition(event);
        mouseState.up = event.deltaY < 0;
        mouseState.down = event.deltaY > 0;
        sendMouseStateNow();
        mouseState.up = false;
        mouseState.down = false;
        sendMouseStateNow();
      };
      const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
      };
      const handleClick = () => inputPlane.focus({ preventScroll: true });
      const mouseMoveEvent =
        'onpointerrawupdate' in window
          ? 'pointerrawupdate'
          : 'onpointermove' in window
          ? 'pointermove'
          : 'mousemove';
      inputPlane.addEventListener(mouseMoveEvent, handleMouseMove);
      inputPlane.addEventListener('pointerdown', handlePointerDown);
      inputPlane.addEventListener('pointerup', handlePointerUp);
      inputPlane.addEventListener('pointercancel', handlePointerUp);
      inputPlane.addEventListener('mousedown', handleMouseDown);
      inputPlane.addEventListener('mouseup', handleMouseUp);
      inputPlane.addEventListener('mouseleave', handleMouseLeave);
      inputPlane.addEventListener('wheel', handleWheel, { passive: false });
      inputPlane.addEventListener('contextmenu', handleContextMenu);
      inputPlane.addEventListener('click', handleClick);
      display.oncursor = (canvas: HTMLCanvasElement, x: number, y: number) => {
        inputPlane.style.cursor = `url(${canvas.toDataURL(
          'image/png',
        )}) ${x} ${y}, auto`;
        display.showCursor(false);
      };
      display.showCursor(false);
      mouseRef.current = {
        cleanup: () => {
          resizeObserver?.disconnect();
          window.removeEventListener('resize', scheduleDisplayFit);
          inputPlane.removeEventListener(mouseMoveEvent, handleMouseMove);
          inputPlane.removeEventListener('pointerdown', handlePointerDown);
          inputPlane.removeEventListener('pointerup', handlePointerUp);
          inputPlane.removeEventListener('pointercancel', handlePointerUp);
          inputPlane.removeEventListener('mousedown', handleMouseDown);
          inputPlane.removeEventListener('mouseup', handleMouseUp);
          inputPlane.removeEventListener('mouseleave', handleMouseLeave);
          inputPlane.removeEventListener('wheel', handleWheel);
          inputPlane.removeEventListener('contextmenu', handleContextMenu);
          inputPlane.removeEventListener('click', handleClick);
        },
      };

      const keyboard = new Guacamole.Keyboard(inputPlane);
      keyboard.onkeydown = (keysym: number) => {
        client.sendKeyEvent(1, keysym);
      };
      keyboard.onkeyup = (keysym: number) => {
        client.sendKeyEvent(0, keysym);
      };
      keyboardRef.current = keyboard;

      client.connect('');
    } catch (e: any) {
      const text =
        e?.response?.data?.message ||
        e?.message ||
        tr('创建 WebDesktop 会话失败', 'Failed to create WebDesktop session');
      setError(text);
      setConnecting(false);
      setConnected(false);
    }
  };

  const clearCredential = async () => {
    try {
      await deleteWebDesktopCredential(proxyId, {
        protocol,
        username: String(form.getFieldValue('username') || '').trim(),
        domain: String(form.getFieldValue('domain') || '').trim(),
      });
      message.success(tr('已清除保存密码', 'Saved password cleared'));
      form.setFieldsValue({ password: '', save_credential: false });
      loadTarget();
    } catch (e: any) {
      message.error(
        e?.response?.data?.message ||
          tr('清除保存密码失败', 'Failed to clear saved password'),
      );
    }
  };

  return (
    <PageContainer title={tr('WebDesktop', 'WebDesktop')}>
      <div className="webdesktop-shell">
        <div className="webdesktop-toolbar">
          <Space size={12} wrap>
            <Text strong>
              {target?.proxy_name || tr('远程桌面访问', 'Remote Desktop Entry')}
            </Text>
            {target && (
              <Text type="secondary">
                {target.application_name} · {target.target_host}:
                {target.target_port}
              </Text>
            )}
            {target && <Tag color="blue">{target.protocol.toUpperCase()}</Tag>}
            {target && (
              <Tag color={active ? 'success' : 'error'}>
                {active ? tr('可用', 'Available') : tr('不可用', 'Unavailable')}
              </Tag>
            )}
            {savedCredentials.length > 0 && (
              <Tag color="green">{tr('已保存凭据', 'Saved credential')}</Tag>
            )}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadTarget}>
              {tr('刷新', 'Refresh')}
            </Button>
            <Button
              icon={
                fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />
              }
              disabled={!connected}
              onClick={toggleFullscreen}
            >
              {fullscreen
                ? tr('退出全屏', 'Exit fullscreen')
                : tr('全屏', 'Fullscreen')}
            </Button>
            <Button
              icon={<DisconnectOutlined />}
              disabled={!connected && !connecting}
              onClick={disconnect}
            >
              {tr('断开', 'Disconnect')}
            </Button>
          </Space>
        </div>

        {loading && (
          <div className="webdesktop-loading">
            <Spin />
          </div>
        )}
        {!loading && !active && (
          <Alert
            className="webdesktop-alert"
            type="warning"
            showIcon
            message={
              target?.effective_status_message ||
              tr('当前远程桌面访问不可用', 'Remote desktop entry unavailable')
            }
          />
        )}
        {!loading && error && (
          <Alert
            className="webdesktop-alert"
            type="error"
            showIcon
            message={error}
          />
        )}

        <div className="webdesktop-login">
          <Form
            form={form}
            layout="inline"
            onFinish={connect}
            disabled={connecting || connected || loading}
          >
            {protocol === 'rdp' && (
              <>
                <Form.Item name="domain">
                  <Input placeholder={tr('域（可选）', 'Domain (optional)')} />
                </Form.Item>
                <Form.Item
                  name="username"
                  rules={[
                    {
                      required: true,
                      message: tr('请输入用户名', 'Username is required'),
                    },
                  ]}
                >
                  <AutoComplete
                    allowClear
                    defaultActiveFirstOption={false}
                    options={savedOptions}
                    onSelect={applySelectedCredential}
                  >
                    <Input
                      autoComplete="username"
                      placeholder={tr('用户名', 'Username')}
                    />
                  </AutoComplete>
                </Form.Item>
              </>
            )}
            <Form.Item
              name="password"
              rules={[
                {
                  validator: async (_, value) => {
                    if (!selectedSavedCredential && !value) {
                      throw new Error(tr('请输入密码', 'Password is required'));
                    }
                  },
                },
              ]}
            >
              <Input.Password
                autoComplete="current-password"
                placeholder={
                  selectedSavedCredential
                    ? tr(
                        '留空使用保存密码',
                        'Leave blank to use saved password',
                      )
                    : tr('密码', 'Password')
                }
                onPressEnter={() => form.submit()}
              />
            </Form.Item>
            <Form.Item name="save_credential" valuePropName="checked">
              <Checkbox>{tr('保存密码', 'Save password')}</Checkbox>
            </Form.Item>
            {selectedSavedCredential && (
              <Popconfirm
                title={tr('清除当前保存密码？', 'Clear this saved password?')}
                okText={tr('清除', 'Clear')}
                cancelText={tr('取消', 'Cancel')}
                onConfirm={clearCredential}
              >
                <Button type="link" disabled={connecting || connected}>
                  {tr('清除保存密码', 'Clear saved password')}
                </Button>
              </Popconfirm>
            )}
            <Button
              type="primary"
              htmlType="submit"
              loading={connecting}
              disabled={!active || connected || loading}
            >
              <SendOutlined />{' '}
              {connected ? tr('已连接', 'Connected') : tr('连接', 'Connect')}
            </Button>
          </Form>
        </div>

        <div className="webdesktop-display" ref={displayHostRef}>
          <div className="webdesktop-display-stage" ref={displayContentRef} />
          <SessionWatermark lines={watermarkLines} />
        </div>
      </div>
    </PageContainer>
  );
};

export default WebDesktopPage;
