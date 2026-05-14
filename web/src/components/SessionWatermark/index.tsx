import { useEffect, useState } from 'react';
import './index.less';

const watermarkTileCount = 96;
const watermarkTileIndexes = Array.from(
  { length: watermarkTileCount },
  (_, index) => index,
);

const padTimePart = (value: number) => String(value).padStart(2, '0');

const formatSessionWatermarkTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = padTimePart(now.getMonth() + 1);
  const day = padTimePart(now.getDate());
  const hour = padTimePart(now.getHours());
  const minute = padTimePart(now.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

export const useSessionWatermarkTime = () => {
  const [time, setTime] = useState(formatSessionWatermarkTime);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTime(formatSessionWatermarkTime());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return time;
};

export const buildSessionWatermarkLabel = (
  parts: Array<string | number | undefined | null>,
) => {
  const seen = new Set<string>();
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .filter((part) => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join(' · ');
};

type SessionWatermarkProps = {
  lines: Array<string | undefined>;
};

const SessionWatermark: React.FC<SessionWatermarkProps> = ({ lines }) => {
  const visibleLines = lines.filter(Boolean) as string[];
  if (visibleLines.length === 0) return null;

  return (
    <div className="session-watermark" aria-hidden="true">
      {watermarkTileIndexes.map((index) => (
        <div className="session-watermark__tile" key={index}>
          {visibleLines.map((line, lineIndex) => (
            <span key={`${lineIndex}-${line}`}>{line}</span>
          ))}
        </div>
      ))}
    </div>
  );
};

export default SessionWatermark;
