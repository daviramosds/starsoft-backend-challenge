import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, Seat, SeatStatus } from '@/entities';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
  ) {}

  async create(createSessionDto: CreateSessionDto): Promise<Session> {
    const existingSession = await this.sessionRepository.findOne({
      where: {
        room: createSessionDto.room,
        startTime: new Date(createSessionDto.startTime),
      },
    });

    if (existingSession) {
      throw new ConflictException('Uma sessão já existe para esta sala no mesmo horário');
    }

    const session = this.sessionRepository.create({
      movieTitle: createSessionDto.movieTitle,
      room: createSessionDto.room,
      startTime: new Date(createSessionDto.startTime),
      ticketPrice: createSessionDto.ticketPrice,
      totalSeats: createSessionDto.totalSeats,
      availableSeats: createSessionDto.totalSeats,
    });

    const seats: Seat[] = [];
    for (let i = 1; i <= createSessionDto.totalSeats; i++) {
      const seat = new Seat();
      seat.seatNumber = `A${i}`;
      seat.status = SeatStatus.AVAILABLE;
      seat.session = session;
      seats.push(seat);
    }

    session.seats = seats;

    const saved = await this.sessionRepository.save(session);

    if (saved.seats) {
      saved.seats.forEach((seat) => delete seat.session);
    }

    return saved;
  }

  async findAll(): Promise<Session[]> {
    const sessions = await this.sessionRepository.find({
      relations: ['seats'],
      order: { startTime: 'ASC' },
    });

    sessions.forEach((session) => {
      if (session.seats) {
        session.seats.forEach((seat) => delete seat.session);
      }
    });

    return sessions;
  }

  async findOne(id: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['seats'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session?.seats) {
      session.seats.forEach((seat) => delete seat.session);
    }

    return session;
  }

  async getAvailableSeats(sessionId: string): Promise<Seat[]> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['seats'],
    });

    return session?.seats.filter((seat) => seat.status === SeatStatus.AVAILABLE) || [];
  }
}
