import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'

interface ImageGalleryProps {
  images: string[]
  alt: string
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const navigate = useCallback((dir: 1 | -1) => {
    setLightboxIndex((prev) => (prev + dir + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigate(-1)
      else if (e.key === 'ArrowRight') navigate(1)
      else if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxOpen, navigate])

  if (images.length === 0) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
        No images available
      </div>
    )
  }

  return (
    <>
      {/* Primary image */}
      <button
        onClick={() => openLightbox(0)}
        className="w-full rounded-lg overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <img
          src={images[0]}
          alt={alt}
          className="w-full aspect-video object-cover"
        />
      </button>

      {/* Thumbnail grid */}
      {images.length > 1 && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {images.slice(1).map((img, i) => (
            <button
              key={i}
              onClick={() => openLightbox(i + 1)}
              className="rounded-md overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <img
                src={img}
                alt={`${alt} ${i + 2}`}
                loading="lazy"
                className="w-full aspect-video object-cover hover:opacity-80 transition-opacity"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-none">
          <VisuallyHidden.Root>
            <DialogTitle>Image {lightboxIndex + 1} of {images.length}</DialogTitle>
          </VisuallyHidden.Root>

          {/* Close button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-10 text-white/70 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation */}
          {images.length > 1 && (
            <>
              <button
                onClick={() => navigate(-1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white bg-black/50 rounded-full p-2"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={() => navigate(1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white bg-black/50 rounded-full p-2"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Image */}
          <div className="flex items-center justify-center min-h-[60vh]">
            <img
              src={images[lightboxIndex]}
              alt={`${alt} ${lightboxIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain"
            />
          </div>

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {lightboxIndex + 1} / {images.length}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
