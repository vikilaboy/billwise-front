import type {ReactNode} from "react";
import {Calendar, Checkbox, DateField, DatePicker, Label, ListBox, Select} from "@heroui/react";
import {parseDate} from "@internationalized/date";

export type AppSelectOption = {
  id: string;
  label: string;
  isDisabled?: boolean;
};

export function AppSelect({
  name,
  apiFields,
  label,
  ariaLabel,
  value,
  options,
  placeholder = "Selectează",
  className,
  isDisabled,
  onChange,
}: {
  name?: string;
  apiFields?: string[];
  label?: string;
  ariaLabel?: string;
  value: string;
  options: AppSelectOption[];
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  onChange: (value: string) => void;
}) {
  const disabledKeys = options.filter((option) => option.isDisabled).map((option) => option.id);

  return (
    <div className={className} data-api-fields={apiFields?.join(" ")}>
      <Select
        aria-label={ariaLabel ?? label}
        disabledKeys={disabledKeys}
        isDisabled={isDisabled}
        name={name}
        placeholder={placeholder}
        value={value || null}
        onChange={(nextValue) => onChange(String(nextValue ?? ""))}
      >
        {label ? <Label>{label}</Label> : null}
        <Select.Trigger className="w-full">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((option) => (
              <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

export function AppCheckbox({
  id,
  name,
  value,
  ariaLabel,
  apiFields,
  isSelected,
  isDisabled,
  className,
  children,
  onChange,
}: {
  id?: string;
  name?: string;
  value?: string;
  ariaLabel?: string;
  apiFields?: string[];
  isSelected: boolean;
  isDisabled?: boolean;
  className?: string;
  children: ReactNode;
  onChange: (isSelected: boolean) => void;
}) {
  return (
    <div className={className} data-api-fields={apiFields?.join(" ")}>
      <Checkbox
        aria-label={ariaLabel}
        id={id}
        isDisabled={isDisabled}
        isSelected={isSelected}
        name={name}
        value={value}
        onChange={onChange}
      >
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          {children}
        </Checkbox.Content>
      </Checkbox>
    </div>
  );
}

export function AppDatePicker({
  name,
  label,
  ariaLabel,
  value,
  minValue,
  maxValue,
  className,
  isDisabled,
  onChange,
}: {
  name: string;
  label?: string;
  ariaLabel: string;
  value: string;
  minValue?: string;
  maxValue?: string;
  className?: string;
  isDisabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <DatePicker
      aria-label={ariaLabel}
      className={className}
      isDisabled={isDisabled}
      name={name}
      minValue={minValue ? parseDate(minValue) : undefined}
      maxValue={maxValue ? parseDate(maxValue) : undefined}
      value={value ? parseDate(value) : null}
      onChange={(nextValue) => onChange(nextValue?.toString() ?? "")}
    >
      {label ? <Label>{label}</Label> : null}
      <DateField.Group fullWidth>
        <DateField.Input>
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover>
        <Calendar aria-label={ariaLabel}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(date) => <Calendar.Cell date={date} />}
            </Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({year}) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}
