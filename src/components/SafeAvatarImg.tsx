import React, { useState, useEffect } from 'react';
import { toAssetUrl, resolveImageToDataUrl } from '../utils/imageUtils';

interface SafeAvatarImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export const SafeAvatarImg: React.FC<SafeAvatarImgProps> = ({
  src,
  alt = '',
  className = '',
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(() => toAssetUrl(src));

  useEffect(() => {
    let isMounted = true;

    // Public URL や Data URL の場合は即時反映
    if (!src || src.startsWith('data:') || src.startsWith('/characters/')) {
      setCurrentSrc(src || '');
      return;
    }

    // ローカルファイルまたは asset:// URL の場合は IPC 経由で確実に解決
    resolveImageToDataUrl(src).then((resolved) => {
      if (isMounted && resolved) {
        setCurrentSrc(resolved);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [src]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (src && currentSrc !== src) {
          resolveImageToDataUrl(src).then((res) => {
            if (res && res !== currentSrc) {
              setCurrentSrc(res);
            }
          });
        }
      }}
      {...props}
    />
  );
};
