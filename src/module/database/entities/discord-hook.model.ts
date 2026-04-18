import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

@Table({ tableName: 'discord_hooks', timestamps: true })
export class DiscordHook extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column(DataType.STRING)
  declare event: string;

  @Column(DataType.JSONB)
  declare payload: object;

  @Default(null)
  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare success: boolean | null;

  @Default(0)
  @Column(DataType.INTEGER)
  declare failedTries: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastTryAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare nextRetryAt: Date | null;

  @UpdatedAt
  declare updatedAt: Date;

  @CreatedAt
  declare createdAt: Date;
}
