import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Seat } from './seat.entity';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @ManyToOne(() => Seat, (seat) => seat.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seatId' })
  seat: Seat;

  @Column()
  seatId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reservationId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentId: string;

  @CreateDateColumn()
  createdAt: Date;
}
