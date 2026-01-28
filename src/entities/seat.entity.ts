import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Session } from './session.entity';
import { Reservation } from './reservation.entity';
import { Sale } from './sale.entity';

export enum SeatStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  SOLD = 'sold',
}

@Entity('seats')
@Index(['session', 'seatNumber'], { unique: true })
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  seatNumber: string;

  @Column({
    type: 'enum',
    enum: SeatStatus,
    default: SeatStatus.AVAILABLE,
  })
  status: SeatStatus;

  @Exclude() // Previne referência circular ao serializar JSON
  @ManyToOne(() => Session, (session) => session.seats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Column()
  sessionId: string;

  @Exclude() // Não precisa serializar relações inversas
  @OneToMany(() => Reservation, (reservation) => reservation.seat)
  reservations: Reservation[];

  @Exclude() // Não precisa serializar relações inversas
  @OneToMany(() => Sale, (sale) => sale.seat)
  sales: Sale[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'int', default: 0 })
  version: number;
}
