import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private client: ClientProxy;
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly EXCHANGE_NAME = 'cinema.exchange';

  constructor(private configService: ConfigService) {
    this.client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [this.configService.get<string>('RABBITMQ_URL')],
        queue: 'cinema_events',
        queueOptions: {
          durable: true,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      await this.setupExchange();
    } catch (error) {
      console.warn('Failed to connect to RabbitMQ:', error.message);
      console.warn('RabbitMQ events will not be published');
    }
  }

  private async setupExchange(): Promise<void> {
    try {
      const url = this.configService.get<string>('RABBITMQ_URL');
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.EXCHANGE_NAME, 'direct', { durable: true });
      const queues = ['reservation.created', 'payment.confirmed', 'reservation.expired'];
      for (const routingKey of queues) {
        const queueName = `cinema.${routingKey}`;
        await this.channel.assertQueue(queueName, { durable: true });
        await this.channel.bindQueue(queueName, this.EXCHANGE_NAME, routingKey);
      }

      console.log('RabbitMQ exchange and queues set up successfully');
    } catch (error) {
      console.warn('Failed to setup RabbitMQ exchange:', error.message);
    }
  }

  async publishEvent(pattern: string, data: any): Promise<void> {
    try {
      if (this.channel) {
        this.channel.publish(this.EXCHANGE_NAME, pattern, Buffer.from(JSON.stringify(data)));
      }
      await this.client.emit(pattern, data).toPromise();
    } catch (error) {
      console.warn(`Failed to publish event ${pattern}:`, error.message);
    }
  }

  getClient(): ClientProxy {
    return this.client;
  }

  async onModuleDestroy() {
    await this.closeConnections();
    if (this.client) {
      await this.client.close();
    }
  }

  async closeConnections(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.warn('Error closing RabbitMQ connections:', error.message);
    }
  }
}
