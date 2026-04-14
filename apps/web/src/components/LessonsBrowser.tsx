import React, { useState, useCallback } from "react";

/* ── Lesson Data Structure ── */
interface Lesson {
  id: string;
  title: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string;
  steps: LessonStep[];
  icon: string;
}

interface LessonStep {
  title: string;
  explanation: string;
  code: string;
  hint?: string;
  blockEquivalent?: string;
  challenge?: string;
}

const LESSONS: Lesson[] = [
  /* ─── Beginner: JavaScript Basics ─── */
  {
    id: "js-variables",
    title: "Variables & Data",
    category: "JS Basics",
    difficulty: "beginner",
    icon: "📦",
    description: "Learn how to store and use data with variables — the building blocks of every program!",
    steps: [
      {
        title: "What are Variables?",
        explanation: "A variable is like a labeled box that holds a value. In Scratch, you use the \"set myVar to 0\" block — in JavaScript, you write code to do the same thing!",
        code: `// Create a variable called "score" and set it to 0
let score = 0;

// Now change it!
score = score + 10;

// Print it out
console.log("Your score is: " + score);`,
        blockEquivalent: "set [score] to (0)\nchange [score] by (10)\nsay (join [Your score is: ] (score))",
        hint: "\"let\" creates a new variable. You can change it whenever you want!",
      },
      {
        title: "Different Types of Data",
        explanation: "Variables can hold different types: numbers, text (strings), and true/false (booleans).",
        code: `// Number — for counting, math, positions
let lives = 3;

// String — for text and messages
let playerName = "BlockForge Hero";

// Boolean — true or false
let isAlive = true;

console.log(playerName + " has " + lives + " lives");`,
        blockEquivalent: "set [lives] to (3)\nset [playerName] to [BlockForge Hero]",
        challenge: "Try creating a variable for your age and print it!",
      },
      {
        title: "Const vs Let",
        explanation: "Use \"let\" if the value will change, and \"const\" if it won't.",
        code: `// This will NEVER change
const GRAVITY = 10;
const GAME_TITLE = "My Awesome Game";

// This WILL change during the game
let score = 0;
let level = 1;

score = score + 100;    // ✅ Works!
// GRAVITY = 20;        // ❌ Error! Can't change const`,
        hint: "Pro tip: use UPPERCASE for constants that represent fixed values.",
      },
    ],
  },
  {
    id: "js-console",
    title: "Printing & Output",
    category: "JS Basics",
    difficulty: "beginner",
    icon: "💬",
    description: "Learn how to make your program talk! Show messages, debug your code, and display results.",
    steps: [
      {
        title: "console.log()",
        explanation: "In Scratch you use \"say\" blocks. In JavaScript, console.log() prints messages to the console.",
        code: `// Say hello!
console.log("Hello, world!");

// Print numbers
console.log(42);

// Print calculations
console.log(10 + 5);    // prints: 15
console.log("Score: " + 100);  // prints: Score: 100`,
        blockEquivalent: "say [Hello, world!]\nsay (10 + 5)",
        hint: "Open your browser's Developer Tools (F12) to see console output!",
      },
      {
        title: "Template Literals",
        explanation: "A cleaner way to mix text and variables using backticks (`) and ${...}",
        code: `let name = "Alex";
let score = 250;
let level = 3;

// Old way (concatenation)
console.log("Hi " + name + "! Score: " + score);

// New way (template literal) — much easier!
console.log(\`Hi \${name}! Score: \${score}, Level: \${level}\`);

// You can even do math inside \${}
console.log(\`Next level at: \${level * 100} points\`);`,
        challenge: "Try making a template literal that says your name and favorite food!",
      },
    ],
  },
  {
    id: "js-math",
    title: "Math & Operators",
    category: "JS Basics",
    difficulty: "beginner",
    icon: "🔢",
    description: "Add, subtract, multiply, divide — and some cool tricks you can't do with Scratch blocks!",
    steps: [
      {
        title: "Basic Math",
        explanation: "Just like the green Operator blocks in Scratch, JavaScript can do math!",
        code: `// Basic operators
let a = 10 + 5;     // 15   (add)
let b = 10 - 3;     // 7    (subtract)
let c = 4 * 6;      // 24   (multiply)
let d = 20 / 4;     // 5    (divide)
let e = 10 % 3;     // 1    (remainder / mod)

console.log(a, b, c, d, e);

// Random number (like "pick random 1 to 10")
let random = Math.floor(Math.random() * 10) + 1;
console.log("Random: " + random);`,
        blockEquivalent: "(10) + (5)\n(10) - (3)\n(4) * (6)\n(20) / (4)\npick random (1) to (10)",
      },
      {
        title: "Useful Math Functions",
        explanation: "JavaScript's Math object has tons of helpful functions!",
        code: `// Round numbers
console.log(Math.round(3.7));    // 4
console.log(Math.floor(3.9));    // 3 (round DOWN)
console.log(Math.ceil(3.1));     // 4 (round UP)

// Absolute value (always positive)
console.log(Math.abs(-5));       // 5

// Max and min
console.log(Math.max(10, 20, 5));  // 20
console.log(Math.min(10, 20, 5));  // 5

// Square root
console.log(Math.sqrt(16));      // 4`,
        challenge: "Try finding the maximum of 3 test scores: 85, 92, and 78!",
      },
    ],
  },
  {
    id: "js-conditions",
    title: "If/Else Decisions",
    category: "JS Basics",
    difficulty: "beginner",
    icon: "🔀",
    description: "Make your code choose different paths — just like the \"if then else\" block in Scratch!",
    steps: [
      {
        title: "If Statements",
        explanation: "In Scratch: \"if <condition> then\". In JavaScript: if (condition) { ... }",
        code: `let score = 85;

// Simple if
if (score >= 90) {
  console.log("A grade! Amazing! 🌟");
}

// If / else
if (score >= 70) {
  console.log("You passed! ✅");
} else {
  console.log("Keep trying! 💪");
}`,
        blockEquivalent: "if <(score) > (90)> then\n  say [A grade! Amazing!]\nend\nif <(score) > (70)> then\n  say [You passed!]\nelse\n  say [Keep trying!]\nend",
      },
      {
        title: "Multiple Conditions",
        explanation: "Check multiple things with else if, or combine conditions with && (and) and || (or).",
        code: `let temperature = 25;

// Chain of conditions
if (temperature > 35) {
  console.log("🔥 It's super hot!");
} else if (temperature > 25) {
  console.log("☀️ Nice and warm");
} else if (temperature > 10) {
  console.log("🌤️ A bit chilly");
} else {
  console.log("🥶 Freezing!");
}

// Combining conditions with && (and) and || (or)
let hasKey = true;
let level = 5;

if (hasKey && level >= 5) {
  console.log("🚪 You can open the door!");
}`,
        challenge: "Write an if/else chain for a game: score > 1000 = 'Winner', > 500 = 'Almost', else = 'Try again'",
      },
      {
        title: "Comparison Operators",
        explanation: "All the ways to compare values in JavaScript.",
        code: `let x = 10;

console.log(x === 10);  // true  (equals)
console.log(x !== 5);   // true  (not equals)
console.log(x > 5);     // true  (greater than)
console.log(x < 20);    // true  (less than)
console.log(x >= 10);   // true  (greater or equal)
console.log(x <= 10);   // true  (less or equal)

// ⚠️ Use === not == (triple equals is safer!)
console.log(10 === "10");  // false (different types)
console.log(10 == "10");   // true  (loose, can be tricky)`,
        hint: "Always use === (triple equals) for comparisons! It's more reliable.",
        blockEquivalent: "(x) = (10)\n(x) > (5)\n(x) < (20)\nnot <(x) = (5)>",
      },
    ],
  },
  /* ─── Beginner: Loops ─── */
  {
    id: "js-loops",
    title: "Loops & Repetition",
    category: "JS Basics",
    difficulty: "beginner",
    icon: "🔄",
    description: "Repeat actions automatically — like Scratch's \"repeat\" and \"forever\" blocks!",
    steps: [
      {
        title: "For Loops",
        explanation: "In Scratch: \"repeat 10\". In JavaScript: for loops let you repeat code a specific number of times.",
        code: `// Repeat 5 times (like "repeat 5")
for (let i = 0; i < 5; i++) {
  console.log("Step " + (i + 1));
}
// Prints: Step 1, Step 2, Step 3, Step 4, Step 5

// Count by 2s
for (let i = 0; i <= 10; i += 2) {
  console.log(i);  // 0, 2, 4, 6, 8, 10
}`,
        blockEquivalent: "repeat (5)\n  say (join [Step ] (i))\nend",
        hint: "i++ means i = i + 1. It's a shortcut!",
      },
      {
        title: "While Loops",
        explanation: "Like Scratch's \"repeat until\" — keep going while a condition is true.",
        code: `// While loop — repeat while condition is true
let energy = 100;

while (energy > 0) {
  console.log("Energy: " + energy);
  energy = energy - 25;  // lose energy each loop
}
console.log("Out of energy! 💤");

// This is like Scratch's "repeat until <energy = 0>"`,
        blockEquivalent: "repeat until <(energy) = (0)>\n  say (energy)\n  change [energy] by (-25)\nend",
        challenge: "Make a while loop that doubles a number until it's over 1000!",
      },
      {
        title: "Looping Through Lists",
        explanation: "Loop through each item in an array (list) — something you do ALL the time in coding!",
        code: `// An array (like a Scratch list)
let fruits = ["apple", "banana", "cherry", "date"];

// Loop through each item
for (let fruit of fruits) {
  console.log("I like " + fruit + "!");
}

// Or with the index
for (let i = 0; i < fruits.length; i++) {
  console.log((i + 1) + ". " + fruits[i]);
}

// forEach — another popular way
fruits.forEach((fruit, index) => {
  console.log(\`#\${index + 1}: \${fruit}\`);
});`,
      },
    ],
  },
  /* ─── Intermediate: Functions ─── */
  {
    id: "js-functions",
    title: "Functions (My Blocks!)",
    category: "Functions",
    difficulty: "intermediate",
    icon: "🧩",
    description: "Create reusable code — just like Scratch's \"My Blocks\" but way more powerful!",
    steps: [
      {
        title: "Creating Functions",
        explanation: "In Scratch: \"define myBlock\". In JavaScript: function myBlock() { }",
        code: `// Define a function (like "define greet")
function greet(name) {
  console.log("Hello, " + name + "! 👋");
}

// Call it (like "greet" block)
greet("Alex");     // Hello, Alex! 👋
greet("BlockForge"); // Hello, BlockForge! 👋

// Function with return value
function add(a, b) {
  return a + b;
}

let result = add(5, 3);
console.log(result);  // 8`,
        blockEquivalent: "define [greet] (name)\n  say (join [Hello, ] (name))\n\ngreet [Alex]",
      },
      {
        title: "Arrow Functions",
        explanation: "A shorter, modern way to write functions — very common in real code!",
        code: `// Regular function
function double(x) {
  return x * 2;
}

// Arrow function — same thing, shorter!
const double2 = (x) => x * 2;

// Both work the same
console.log(double(5));    // 10
console.log(double2(5));   // 10

// Arrow function with multiple lines
const greet = (name) => {
  let message = "Welcome, " + name + "!";
  console.log(message);
  return message;
};

greet("Player 1");`,
        challenge: "Write an arrow function that takes a score and returns the letter grade (A/B/C/D/F)!",
      },
      {
        title: "Functions as Game Logic",
        explanation: "Use functions to organize game code — each function handles one task!",
        code: `// --- Game functions ---
function createPlayer(name) {
  return {
    name: name,
    health: 100,
    score: 0,
    x: 0,
    y: 0,
  };
}

function movePlayer(player, dx, dy) {
  player.x += dx;
  player.y += dy;
  console.log(\`\${player.name} moved to (\${player.x}, \${player.y})\`);
}

function takeDamage(player, amount) {
  player.health -= amount;
  if (player.health <= 0) {
    console.log(player.name + " was defeated! 💀");
  }
}

// Use them!
let hero = createPlayer("Hero");
movePlayer(hero, 10, 5);
takeDamage(hero, 30);
console.log(hero);`,
      },
    ],
  },
  /* ─── Intermediate: Arrays ─── */
  {
    id: "js-arrays",
    title: "Arrays (Lists)",
    category: "Data",
    difficulty: "intermediate",
    icon: "📋",
    description: "Store collections of items — like Scratch lists but with superpowers!",
    steps: [
      {
        title: "Creating & Using Arrays",
        explanation: "An array is a list of values, like Scratch's list variables.",
        code: `// Create an array (list)
let colors = ["red", "blue", "green", "purple"];

// Access items (starts at 0, not 1!)
console.log(colors[0]);      // "red"
console.log(colors[2]);      // "green"
console.log(colors.length);  // 4

// Add items
colors.push("orange");       // add to end
console.log(colors);

// Remove items
colors.pop();                // remove last
colors.splice(1, 1);        // remove item at index 1

console.log(colors);`,
        blockEquivalent: "add [orange] to [colors]\ndelete (1) of [colors]\nitem (1) of [colors]\nlength of [colors]",
      },
      {
        title: "Array Superpowers",
        explanation: "JavaScript arrays have amazing built-in methods for transforming data!",
        code: `let scores = [85, 92, 78, 95, 88];

// Find the highest score
let best = Math.max(...scores);
console.log("Best: " + best);  // 95

// Filter: keep only scores above 85
let high = scores.filter(s => s > 85);
console.log("High scores:", high);  // [92, 95, 88]

// Map: transform each value
let doubled = scores.map(s => s * 2);
console.log("Doubled:", doubled);

// Reduce: combine all values
let total = scores.reduce((sum, s) => sum + s, 0);
let average = total / scores.length;
console.log("Average: " + average);

// Find: get the first match
let first90 = scores.find(s => s >= 90);
console.log("First 90+: " + first90);  // 92`,
        challenge: "Create an array of 5 names, filter to names longer than 4 letters, then make them all uppercase!",
      },
    ],
  },
  /* ─── Intermediate: Objects ─── */
  {
    id: "js-objects",
    title: "Objects (Sprites!)",
    category: "Data",
    difficulty: "intermediate",
    icon: "🎭",
    description: "Group related data together — this is actually how sprites work internally!",
    steps: [
      {
        title: "Creating Objects",
        explanation: "Objects group related properties. Every Scratch sprite is actually an object with x, y, direction, etc!",
        code: `// A sprite object — just like in Scratch!
let cat = {
  name: "Cat",
  x: 0,
  y: 0,
  direction: 90,
  size: 100,
  visible: true,
  costume: "costume1",
  sayText: "",
};

// Access properties
console.log(cat.name);       // "Cat"
console.log(cat.x);          // 0

// Change properties (like set x, set y blocks)
cat.x = 100;
cat.y = 50;
cat.sayText = "Hello!";

console.log(\`\${cat.name} is at (\${cat.x}, \${cat.y})\`);
console.log(\`Says: \${cat.sayText}\`);`,
        blockEquivalent: "set x to (100)\nset y to (50)\nsay [Hello!]",
      },
      {
        title: "Objects with Methods",
        explanation: "Objects can have functions (methods) — actions the object can perform!",
        code: `let player = {
  name: "Hero",
  hp: 100,
  attack: 15,
  defense: 10,
  
  // Methods — things this player can DO
  takeDamage(amount) {
    let damage = Math.max(0, amount - this.defense);
    this.hp -= damage;
    console.log(\`\${this.name} took \${damage} damage! HP: \${this.hp}\`);
  },

  heal(amount) {
    this.hp = Math.min(100, this.hp + amount);
    console.log(\`\${this.name} healed! HP: \${this.hp}\`);
  },

  isAlive() {
    return this.hp > 0;
  }
};

player.takeDamage(25);   // Hero took 15 damage! HP: 85
player.heal(10);          // Hero healed! HP: 95
console.log("Alive?", player.isAlive());  // true`,
      },
    ],
  },
  /* ─── Advanced: DOM Manipulation ─── */
  {
    id: "js-dom",
    title: "Web Page Magic (DOM)",
    category: "Web",
    difficulty: "advanced",
    icon: "🌐",
    description: "Control web pages with JavaScript — change text, colors, add elements, and respond to clicks!",
    steps: [
      {
        title: "Selecting Elements",
        explanation: "The DOM (Document Object Model) lets you find and change anything on a web page.",
        code: `// Find elements on the page
let heading = document.querySelector("h1");
let button = document.querySelector("#myButton");
let allCards = document.querySelectorAll(".card");

// Change text
heading.textContent = "Hello from JavaScript!";

// Change styles
heading.style.color = "#8b5cf6";
heading.style.fontSize = "32px";

// Change classes
heading.classList.add("animate-bounce");
heading.classList.toggle("hidden");`,
        hint: "querySelector uses CSS selectors: #id, .class, or tag name",
      },
      {
        title: "Events & Interaction",
        explanation: "Like Scratch's \"when clicked\" — make things happen when users interact!",
        code: `// When a button is clicked
let button = document.querySelector("#playButton");

button.addEventListener("click", () => {
  console.log("Button clicked! 🎮");
  button.textContent = "Playing...";
  button.style.backgroundColor = "#22c55e";
});

// Keyboard events (like "when key pressed")
document.addEventListener("keydown", (event) => {
  console.log("Key pressed: " + event.key);
  
  if (event.key === "ArrowUp") {
    console.log("Moving up! ⬆️");
  } else if (event.key === " ") {
    console.log("Jump! 🦘");
  }
});`,
        blockEquivalent: "when this sprite clicked\n  say [Clicked!]\n\nwhen [space] key pressed\n  say [Jump!]",
      },
    ],
  },
  /* ─── Advanced: Async ─── */
  {
    id: "js-async",
    title: "Async & Promises",
    category: "Advanced",
    difficulty: "advanced",
    icon: "⏳",
    description: "Handle things that take time — like loading data, waiting, and doing multiple things at once!",
    steps: [
      {
        title: "setTimeout & setInterval",
        explanation: "Like Scratch's \"wait\" and \"forever\" blocks in JavaScript!",
        code: `// Wait then do something (like "wait 2 seconds")
console.log("Starting...");

setTimeout(() => {
  console.log("2 seconds later! ⏰");
}, 2000);

// Repeat every second (like "forever" with "wait 1")
let counter = 0;
let timer = setInterval(() => {
  counter++;
  console.log("Tick: " + counter);
  
  if (counter >= 5) {
    clearInterval(timer);  // Stop!
    console.log("Done counting!");
  }
}, 1000);`,
        blockEquivalent: "wait (2) seconds\n\nforever\n  change [counter] by (1)\n  say (counter)\n  wait (1) seconds\nend",
      },
      {
        title: "Async/Await",
        explanation: "The modern way to handle asynchronous code — clean and easy to read!",
        code: `// Simulate loading data
function loadPlayerData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ name: "Hero", level: 5, score: 1250 });
    }, 1000);
  });
}

// Use async/await — looks like normal code!
async function startGame() {
  console.log("Loading player data...");
  
  let player = await loadPlayerData();
  
  console.log(\`Welcome back, \${player.name}!\`);
  console.log(\`Level \${player.level} | Score: \${player.score}\`);
}

startGame();`,
        hint: "await pauses the function until the Promise resolves — like \"wait until\" in Scratch!",
      },
    ],
  },
  /* ─── Game Building ─── */
  {
    id: "js-game",
    title: "Build a Mini Game!",
    category: "Projects",
    difficulty: "intermediate",
    icon: "🎮",
    description: "Put it all together — build a number guessing game step by step!",
    steps: [
      {
        title: "Game Setup",
        explanation: "Set up the game variables and generate a secret number.",
        code: `// --- Number Guessing Game ---

// Game state
let secretNumber = Math.floor(Math.random() * 100) + 1;
let guessesLeft = 7;
let gameOver = false;

console.log("🎯 I'm thinking of a number between 1 and 100!");
console.log(\`You have \${guessesLeft} guesses. Good luck!\`);`,
      },
      {
        title: "Game Logic",
        explanation: "Create the function that checks a guess and gives feedback.",
        code: `function makeGuess(guess) {
  if (gameOver) {
    console.log("Game is over! Start a new game.");
    return;
  }

  guessesLeft--;
  
  if (guess === secretNumber) {
    console.log(\`🎉 CORRECT! The number was \${secretNumber}!\`);
    console.log(\`You got it in \${7 - guessesLeft} guesses!\`);
    gameOver = true;
  } else if (guessesLeft === 0) {
    console.log(\`💀 Out of guesses! The number was \${secretNumber}\`);
    gameOver = true;
  } else if (guess < secretNumber) {
    console.log(\`⬆️ Higher! (\${guessesLeft} guesses left)\`);
  } else {
    console.log(\`⬇️ Lower! (\${guessesLeft} guesses left)\`);
  }
}

// Try some guesses!
makeGuess(50);
makeGuess(75);
makeGuess(60);`,
      },
      {
        title: "Full Game",
        explanation: "The complete game with restart functionality!",
        code: `// --- Complete Number Guessing Game ---

class GuessingGame {
  constructor(max = 100, maxGuesses = 7) {
    this.max = max;
    this.maxGuesses = maxGuesses;
    this.reset();
  }

  reset() {
    this.secret = Math.floor(Math.random() * this.max) + 1;
    this.guesses = [];
    this.won = false;
    console.log(\`\\n🎯 New game! Guess 1-\${this.max} in \${this.maxGuesses} tries!\`);
  }

  guess(n) {
    if (this.won || this.guesses.length >= this.maxGuesses) {
      console.log("Game over! Use game.reset() to play again.");
      return;
    }
    this.guesses.push(n);
    let left = this.maxGuesses - this.guesses.length;

    if (n === this.secret) {
      this.won = true;
      console.log(\`🎉 YES! Got it in \${this.guesses.length} tries!\`);
    } else {
      let hint = n < this.secret ? "⬆️ Higher" : "⬇️ Lower";
      console.log(\`\${hint} (\${left} left)\`);
    }
  }
}

let game = new GuessingGame();
game.guess(50);`,
        challenge: "Try adding a difficulty setting: easy (1-50, 10 guesses), hard (1-1000, 10 guesses)!",
      },
    ],
  },
];

/* ── Component ── */
export default function LessonsBrowser({ onClose }: { onClose: () => void }) {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [filter, setFilter] = useState<"all" | "beginner" | "intermediate" | "advanced">("all");

  const groupedLessons = LESSONS.reduce<Record<string, Lesson[]>>((acc, l) => {
    if (filter !== "all" && l.difficulty !== filter) return acc;
    (acc[l.category] ??= []).push(l);
    return acc;
  }, {});

  const diffColors = { beginner: "bg-emerald-500", intermediate: "bg-amber-500", advanced: "bg-red-500" };

  if (selectedLesson) {
    const step = selectedLesson.steps[currentStep];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-[#12122a] rounded-2xl border border-white/[0.08] shadow-2xl w-[750px] max-h-[85vh] flex flex-col overflow-hidden">
          {/* Lesson header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <button onClick={() => { setSelectedLesson(null); setCurrentStep(0); }}
                className="text-white/40 hover:text-white/70 text-sm">← Back</button>
              <span className="text-white font-bold text-sm">{selectedLesson.icon} {selectedLesson.title}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full text-white ${diffColors[selectedLesson.difficulty]}`}>
                {selectedLesson.difficulty}
              </span>
            </div>
            <span className="text-white/40 text-xs">Step {currentStep + 1} / {selectedLesson.steps.length}</span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-white/[0.04]">
            <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${((currentStep + 1) / selectedLesson.steps.length) * 100}%` }} />
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Step title */}
            <h3 className="text-white font-bold text-lg">{step.title}</h3>
            
            {/* Explanation */}
            <p className="text-white/60 text-sm leading-relaxed">{step.explanation}</p>

            {/* Code block */}
            <div className="bg-black/40 rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
                <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">JavaScript</span>
                <button onClick={() => navigator.clipboard.writeText(step.code)}
                  className="text-[10px] text-violet-400 hover:text-violet-300">📋 Copy</button>
              </div>
              <pre className="p-4 text-sm leading-relaxed overflow-x-auto">
                <code className="text-emerald-300/90">{step.code}</code>
              </pre>
            </div>

            {/* Block equivalent */}
            {step.blockEquivalent && (
              <div className="bg-violet-500/10 rounded-xl border border-violet-500/20 p-4">
                <div className="text-[10px] text-violet-300 font-medium uppercase tracking-wider mb-2">🧩 Scratch Equivalent</div>
                <pre className="text-xs text-violet-200/70 whitespace-pre-wrap font-mono">{step.blockEquivalent}</pre>
              </div>
            )}

            {/* Hint */}
            {step.hint && (
              <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-3 flex gap-2">
                <span className="text-amber-400">💡</span>
                <span className="text-xs text-amber-200/70">{step.hint}</span>
              </div>
            )}

            {/* Challenge */}
            {step.challenge && (
              <div className="bg-emerald-500/10 rounded-xl border border-emerald-500/20 p-3 flex gap-2">
                <span className="text-emerald-400">🏆</span>
                <span className="text-xs text-emerald-200/70"><strong>Challenge:</strong> {step.challenge}</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}
              className="px-4 py-1.5 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] disabled:opacity-30 transition-all">
              ← Previous
            </button>
            <div className="flex gap-1">
              {selectedLesson.steps.map((_, i) => (
                <button key={i} onClick={() => setCurrentStep(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === currentStep ? "bg-violet-500 scale-125" : i < currentStep ? "bg-violet-500/40" : "bg-white/10"}`} />
              ))}
            </div>
            <button onClick={() => {
              if (currentStep < selectedLesson.steps.length - 1) {
                setCurrentStep(currentStep + 1);
              } else {
                setSelectedLesson(null);
                setCurrentStep(0);
              }
            }}
              className="px-4 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500 font-medium transition-all">
              {currentStep < selectedLesson.steps.length - 1 ? "Next →" : "✓ Complete"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Lesson browser
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#12122a] rounded-2xl border border-white/[0.08] shadow-2xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-white font-bold text-sm">📖 JavaScript Lessons</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 text-lg">✕</button>
        </div>

        {/* Difficulty filter */}
        <div className="flex gap-2 px-5 py-2 border-b border-white/[0.06]">
          {(["all", "beginner", "intermediate", "advanced"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                filter === f ? "bg-violet-600 text-white" : "bg-white/[0.04] text-white/40 hover:text-white/70"
              }`}>
              {f === "all" ? "All Levels" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {Object.entries(groupedLessons).map(([category, lessons]) => (
            <div key={category}>
              <h3 className="text-xs text-white/30 font-bold uppercase tracking-wider mb-2">{category}</h3>
              <div className="grid grid-cols-2 gap-2">
                {lessons.map(lesson => (
                  <button key={lesson.id} onClick={() => setSelectedLesson(lesson)}
                    className="group text-left p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-violet-500/30 transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{lesson.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/80 font-medium group-hover:text-white">{lesson.title}</div>
                        <div className="text-[10px] text-white/30 mt-0.5 line-clamp-2">{lesson.description}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full text-white ${diffColors[lesson.difficulty]}`}>
                            {lesson.difficulty}
                          </span>
                          <span className="text-[9px] text-white/20">{lesson.steps.length} steps</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
