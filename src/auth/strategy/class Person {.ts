class Person {
  name: string;
  age: number;

  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }

  greet(name: string, age: number) {
    console.log(`Hi my name is ${name} & I'm ${age} years old`);
  }
}
