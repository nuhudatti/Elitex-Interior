'use client';

import { cldImage, cldPoster, cldVideo, isAudioUrl, isVideoUrl } from '@/lib/cloudinary-url';
import { useModalA11y } from './useModalA11y';

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
    return poster ? (
      <img className={cls} alt="" src={poster} loading="lazy" />
    ) : (
      <div className={cls} aria-hidden>
        Video
      </div>
    );
  }
  return <img className={cls} alt="" src={cldImage(url, large ? 640 : 240)} loading="lazy" />;
}

export function MediaLightbox({ url, type, onClose }: { url: string; type?: string; onClose: () => void }) {
  const ref = useModalA11y(onClose);
  const video = type === 'video' || isVideoUrl(url);
  const audio = type === 'audio' || isAudioUrl(url);
  return (
    <div className="modal-backdrop lightbox" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Media preview"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(920px, 100%)', background: '#0b0a08' }}
      >
        {audio ? (
          <audio controls src={url} style={{ width: '100%' }} />
        ) : video ? (
          <video
            className="preview-media-lg"
            controls
            playsInline
            poster={cldPoster(url, 960) || undefined}
            src={cldVideo(url)}
          />
        ) : (
          <img className="preview-media-lg" alt="" src={cldImage(url, 1600)} />
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
