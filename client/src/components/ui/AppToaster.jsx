import { useEffect } from 'react'
import { ToastBar, Toaster, useToaster } from 'react-hot-toast'
import toast from 'react-hot-toast'

const MAX_TOASTS = 3

const ToastLimiter = () => {
  const { toasts } = useToaster()

  useEffect(() => {
    const visible = toasts.filter((t) => t.visible)
    visible.slice(MAX_TOASTS).forEach((t) => toast.dismiss(t.id))
  }, [toasts])

  return null
}

export const AppToaster = () => (
  <>
    <ToastLimiter />
    <Toaster>
      {(t) => (
        <ToastBar
          toast={t}
          style={{
            ...t.style,
            boxShadow: 'rgba(0, 0, 0, 0.25) 0px -4px inset',
            fontWeight: 700,
          }}
        >
          {({ icon, message }) => (
            <>
              {icon}
              {message}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  </>
)
