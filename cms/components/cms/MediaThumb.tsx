'use client';

import { cldImage, cldPoster, isAudioUrl, isVideoUrl } from '@/lib/cloudinary-url';

export function MediaThumb({ url, type, large }: { url: string; type?: string; large?: boolean }) {
  const cls = large ? 'thumb lg' : 'thumb';
  if (!url) return <div className={cls} aria-hidden />;
  if (type === 'audio' || isAudioUrl(url)) {
    return (
      <div className={cls} aria-hidden>
        Audio
      </div>
    );
  }
  if (type === 'video' || isVideoUrl(url)) {
    const poster = cldPoster(url, large ? 640 : 240);
    return poster ? <img className={cls} alt="" src={poster} loading="lazy" /> : <div className={cls} />;
  }
  return <img className={cls} alt="" src={cldImage(url, large ? 640 : 240)} loading="lazy" />;
}
