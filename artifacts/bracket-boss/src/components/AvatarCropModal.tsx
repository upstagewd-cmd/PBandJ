import { useRef, useState, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  srcUrl: string;
  onConfirm: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}

function centerSquareCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
    width,
    height,
  );
}

async function cropImageToBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const size = Math.min(crop.width, crop.height, 512);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    size,
    size,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function AvatarCropModal({ srcUrl, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [saving, setSaving] = useState(false);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerSquareCrop(width, height));
  }, []);

  const handleConfirm = async () => {
    if (!imgRef.current || !completedCrop) return;
    setSaving(true);
    try {
      const blob = await cropImageToBlob(imgRef.current, completedCrop);
      await onConfirm(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-card border border-border/60 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-extrabold text-center">Crop Photo</h2>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Drag or resize the circle to adjust your photo.
          </p>
        </div>

        <div className="flex justify-center bg-black/40 px-4 pb-4">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={1}
            circularCrop
            minWidth={60}
          >
            <img
              ref={imgRef}
              src={srcUrl}
              onLoad={onImageLoad}
              className="max-h-72 max-w-full object-contain"
              alt="Crop preview"
            />
          </ReactCrop>
        </div>

        <div className="flex gap-3 px-6 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={saving || !completedCrop?.width}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving…</>
            ) : (
              "Save Photo"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
