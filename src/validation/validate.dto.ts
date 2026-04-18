import { BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export function validate<T extends object>(dtoClass: ClassConstructor<T>, source: object): T {
  const dto = plainToInstance(dtoClass, source);

  const errors = validateSync(dto, { whitelist: true, stopAtFirstError: true });
  if (errors.length) {
    const [{ constraints }] = errors;

    if (constraints) {
      throw new BadRequestException(constraints[Object.keys(constraints)[0]]);
    }
    throw new BadRequestException();
  }
  return dto;
}
