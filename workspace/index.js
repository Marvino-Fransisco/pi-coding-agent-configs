const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function divide(a, b) {
    if (b === 0) {
        return "Error: Cannot divide by zero";
    }
    return a / b;
}

rl.question("Enter first number: ", (first) => {
    rl.question("Enter second number: ", (second) => {
        const a = Number(first);
        const b = Number(second);
        const result = divide(a, b);
        console.log(`${a} / ${b} = ${result}`);
        rl.close();
    });
});
