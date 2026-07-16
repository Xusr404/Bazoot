import { useEffect, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Card } from '../ui/Card.jsx'
import { Input } from '../ui/Input.jsx'
import { hasFieldError } from '../../utils/formErrors.js'
import { useTouchedFields } from '../../hooks/useTouchedFields.js'
import { useTranslation } from '../../i18n/index.js'

export const CreateOrganizationDialog = ({
  open,
  pending,
  errorMessage,
  onChange,
  onCreate,
  onCancel,
}) => {
  const [name, setName] = useState('')
  const { touched, touch, clearTouched } = useTouchedFields()
  const { t } = useTranslation()

  useEffect(() => {
    if (open) {
      setName('')
      clearTouched()
    }
  }, [clearTouched, open])

  if (!open) {
    return null
  }

  const valid = name.trim().length >= 2

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4">
      <Card className="anim-show flex w-full max-w-sm flex-col gap-4 p-5">
        <div>
          <p className="text-xs font-bold tracking-widest text-primary uppercase">{t('New workspace')}</p>
          <h2 className="mt-1 text-xl font-black text-gray-950">{t('Create an organization')}</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500">
            {t('Invite a separate team and host games under this workspace.')}
          </p>
        </div>
        <label className="text-sm font-bold text-gray-800">
          {t('Organization name')}
          <Input
            autoFocus
            className="mt-1.5 w-full"
            invalid={
              (touched.name && name.trim().length < 2) ||
              hasFieldError(errorMessage, 'organization')
            }
            valid={touched.name && name.trim().length >= 2}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              onChange?.()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && valid && !pending) {
                onCreate(name.trim())
              }
            }}
            placeholder={t('e.g. Vienna Quiz Club')}
            onBlur={() => touch('name')}
          />
        </label>
        <div className="flex gap-3">
          <Button className="flex-1 text-base" disabled={!valid || pending} onClick={() => onCreate(name.trim())}>
            {pending ? t('Creating…') : t('Create organization')}
          </Button>
          <Button variant="secondary" className="flex-1 text-base" disabled={pending} onClick={onCancel}>
            {t('Cancel')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
