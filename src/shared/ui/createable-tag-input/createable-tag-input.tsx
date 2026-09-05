import type { IProps } from './interfaces/props.interface'

import { CloseButton, Combobox, InputBase, useCombobox } from '@mantine/core'
import { useState } from 'react'
import { PiTagDuotone } from 'react-icons/pi'

export function CreateableTagInputShared(props: IProps) {
    const { tags, value, onChange, defaultValue, ...restProps } = props
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption()
    })

    const [createdTags, setCreatedTags] = useState<string[]>([])
    const data = [...new Set([...tags, ...createdTags])]
    const [search, setSearch] = useState(value === undefined ? (defaultValue ?? '') : (value ?? ''))
    const [error, setError] = useState('')
    const [previousValue, setPreviousValue] = useState(value)

    // Only an actual controlled-value change resets the search, not a tags query refresh.
    if (previousValue !== value) {
        setPreviousValue(value)
        setSearch(value ?? '')
        setError('')
    }

    const validateTag = (tag: string) => {
        if (!/^[A-Z0-9_]+$/.test(tag)) {
            return 'Tag can only contain uppercase letters, numbers, underscores'
        }
        if (tag.length > 16) {
            return 'Tag must be less than 16 characters'
        }
        return null
    }

    const exactOptionMatch = data.some((item) => item === search)
    const filteredOptions = exactOptionMatch
        ? data
        : data.filter((item) => item.toLowerCase().includes(search.toLowerCase().trim()))

    const options = filteredOptions.map((item) => (
        <Combobox.Option key={item} value={item}>
            {item}
        </Combobox.Option>
    ))

    return (
        <Combobox
            onOptionSubmit={(val) => {
                if (val === '$create') {
                    const validationError = validateTag(search)
                    if (validationError) {
                        setError(validationError)
                        return
                    }
                    setCreatedTags((current) => [...new Set([...current, search])])
                    onChange?.(search)
                    setError('')
                } else {
                    onChange?.(val)
                    setSearch(val)
                    setError('')
                }

                combobox.closeDropdown()
            }}
            position="top"
            store={combobox}
            withinPortal={false}
        >
            <Combobox.Target>
                <InputBase
                    {...restProps}
                    description="Create or select a tag"
                    error={error || restProps.error}
                    label="Tag"
                    leftSection={<PiTagDuotone size="16px" />}
                    onBlur={() => {
                        combobox.closeDropdown()
                        onChange?.(search.trim() === '' ? null : search)
                    }}
                    onChange={(event) => {
                        combobox.openDropdown()
                        combobox.updateSelectedOptionIndex()
                        setSearch(event.currentTarget.value)
                    }}
                    onClick={() => combobox.openDropdown()}
                    onFocus={() => combobox.openDropdown()}
                    placeholder="EXAMPLE_TAG_1"
                    rightSection={
                        (value !== null && value !== undefined) || search ? (
                            <CloseButton
                                aria-label="Clear value"
                                onClick={() => {
                                    onChange?.(null)
                                    setError('')
                                    setSearch('')
                                }}
                                onMouseDown={(event) => event.preventDefault()}
                                size="sm"
                            />
                        ) : (
                            <Combobox.Chevron />
                        )
                    }
                    rightSectionPointerEvents={
                        (value === null || value === undefined) && !search ? 'none' : 'all'
                    }
                    value={search}
                />
            </Combobox.Target>

            <Combobox.Dropdown>
                <Combobox.Options mah={200} style={{ overflowY: 'auto' }}>
                    {options}
                    {!exactOptionMatch && search.trim().length > 0 && (
                        <Combobox.Option value="$create">+ {search}</Combobox.Option>
                    )}
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    )
}
