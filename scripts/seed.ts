import { DataSource } from 'typeorm';
import { Session, Seat, SeatStatus } from '../src/entities';
import dataSource from '../src/shared/database/data-source';

async function seed() {
  try {
    console.log('Iniciando seed do banco de dados...');
    await dataSource.initialize();
    console.log('Conexão com banco estabelecida');

    const sessionRepository = dataSource.getRepository(Session);
    await dataSource.query('TRUNCATE TABLE sales, reservations, seats, sessions CASCADE');
    console.log('Dados antigos removidos');

    const session = sessionRepository.create({
      movieTitle: 'Avatar: O Caminho da Água',
      room: 'Sala 1',
      startTime: new Date('2024-02-01T19:00:00'),
      ticketPrice: 25.0,
      totalSeats: 16,
      availableSeats: 16,
    });

    const seats = createSeats(session);
    session.seats = seats;

    await sessionRepository.save(session);

    logSessionInfo(session);

    await dataSource.destroy();
    console.log('Seed concluído com sucesso!');
  } catch (error) {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  }
}

function createSeats(session: Session): Seat[] {
  const seats: Seat[] = [];
  for (let i = 1; i <= 16; i++) {
    const seat = new Seat();
    seat.seatNumber = `A${i}`;
    seat.status = SeatStatus.AVAILABLE;
    seat.session = session;
    seats.push(seat);
  }
  return seats;
}

function logSessionInfo(session: Session): void {
  console.log('Sessão criada com sucesso');
  console.log(`Filme: ${session.movieTitle}`);
  console.log(`Assentos: ${session.totalSeats}`);
  console.log(`Preço: R$ ${session.ticketPrice}`);
  console.log(`Horário: ${session.startTime.toLocaleString('pt-BR')}`);
}

seed();
