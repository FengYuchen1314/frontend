import { Button, FieldError, InputGroup, Label, TextField } from '@heroui/react'
import { type Ref, useState } from 'react'
import { TbEye, TbEyeOff } from 'react-icons/tb'

interface AuthPasswordFieldProps {
    name: string
    label: string
    value: string
    onChange: (value: string) => void
    onBlur: () => void
    inputRef: Ref<HTMLInputElement>
    autoComplete: 'current-password' | 'new-password'
    error?: string
    isDisabled?: boolean
}

/** Native HeroUI composition for authentication passwords, not a legacy input adapter. */
export function AuthPasswordField({
    name,
    label,
    value,
    onChange,
    onBlur,
    inputRef,
    autoComplete,
    error,
    isDisabled
}: AuthPasswordFieldProps) {
    const [visible, setVisible] = useState(false)
    return (
        <TextField
            name={name}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            type={visible ? 'text' : 'password'}
            isRequired
            isInvalid={Boolean(error)}
            isDisabled={isDisabled}
            validationBehavior="aria"
            className="w-full"
        >
            <Label>{label}</Label>
            <InputGroup variant="secondary">
                <InputGroup.Input ref={inputRef} autoComplete={autoComplete} />
                <InputGroup.Suffix>
                    <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        isIconOnly
                        isDisabled={isDisabled}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        aria-pressed={visible}
                        onPress={() => setVisible((current) => !current)}
                    >
                        {visible ? (
                            <TbEyeOff aria-hidden="true" size={18} />
                        ) : (
                            <TbEye aria-hidden="true" size={18} />
                        )}
                    </Button>
                </InputGroup.Suffix>
            </InputGroup>
            <FieldError>{error}</FieldError>
        </TextField>
    )
}
