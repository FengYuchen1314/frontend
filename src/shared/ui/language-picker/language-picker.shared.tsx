import { Dropdown, Label, toast } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { TbLanguage } from 'react-icons/tb'

const languages = [
    { label: 'English', emoji: '🇬🇧', value: 'en' },
    { label: 'Русский', emoji: '🇷🇺', value: 'ru' },
    { label: 'فارسی', emoji: '🇮🇷', value: 'fa' },
    { label: '简体中文', emoji: '🇨🇳', value: 'zh' }
]

export function LanguagePicker() {
    const { i18n } = useTranslation()
    const locale = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]

    return (
        <Dropdown>
            <Dropdown.Trigger
                aria-label="Language"
                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-default"
            >
                <TbLanguage aria-hidden size={22} />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Language"
                    onAction={(key) => {
                        const language = languages.find((entry) => entry.value === key)
                        if (language) {
                            void i18n.changeLanguage(language.value).catch(() => {
                                toast.danger('Unable to change language')
                            })
                        }
                    }}
                    selectedKeys={[locale]}
                    selectionMode="single"
                >
                    {languages.map((language) => (
                        <Dropdown.Item
                            id={language.value}
                            key={language.value}
                            textValue={language.label}
                        >
                            <span aria-hidden>{language.emoji}</span>
                            <Label>{language.label}</Label>
                            <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    )
}
