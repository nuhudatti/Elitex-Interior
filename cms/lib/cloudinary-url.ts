const CLD_RE = /(https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.*)$/;

export function cldImage(url: string, width = 400) {
  const match = CLD_RE.exec(url || '');
  if (!match || match[2] !== 'image') return url;
  if (/\/upload\/[a-z]+_[^/]*\//.test(url)) return url;
  return `${match[1]}f_auto,q_auto,c_limit,w_${width}/${match[3]}`;
}

export function cldVideo(url: string, width = 960) {
  const match = CLD_RE.exec(url || '');
  if (!match || match[2] !== 'video') return url;
  if (/\/upload\/[a-z]+_[^/]*\//.test(url)) return url;
  return `${match[1]}f_mp4,vc_h264,q_auto:eco,c_limit,w_${width}/${match[3]}`;
}

export function cldPoster(url: string, width = 400) {
  const match = CLD_RE.exec(url || '');
  if (!match || match[2] !== 'video') return '';
  const rest = match[3].replace(/\.(mp4|mov|webm)(\?.*)?$/i, '.jpg');
  return `${match[1]}so_0,f_auto,q_auto,c_limit,w_${width}/${rest}`;
}

export function isVideoUrl(url: string) {
  return /\/video\/upload\//.test(url) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

export function isAudioUrl(url: string) {
  return /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url);
}
