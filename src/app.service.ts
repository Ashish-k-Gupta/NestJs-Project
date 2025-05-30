import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    console.log(
      `You have hit the server at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    );
    return 'Hello World!';
  }
}
