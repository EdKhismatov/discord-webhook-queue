import { Type } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';

export class DbConfigDto {
  @IsString()
  host: string;

  @IsNumber()
  @Type(() => Number)
  port: number;

  @IsString()
  user: string;

  @IsString()
  password: string;

  @IsString()
  name: string;
}
