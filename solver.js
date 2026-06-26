(function () {
  "use strict";

  const EMPTY = ".";

  function normalizeTube(tube) {
    return tube.filter((value) => value && value !== EMPTY);
  }

  function topRun(tube) {
    if (!tube.length) {
      return { color: null, count: 0 };
    }
    const color = tube[tube.length - 1];
    let count = 0;
    for (let i = tube.length - 1; i >= 0 && tube[i] === color; i -= 1) {
      count += 1;
    }
    return { color, count };
  }

  function isSolved(tubes, capacities) {
    for (let i = 0; i < tubes.length; i += 1) {
      const tube = tubes[i];
      if (tube.length === 0) {
        continue;
      }
      if (tube.length !== capacities[i]) {
        return false;
      }
      if (!tube.every((value) => value === tube[0])) {
        return false;
      }
    }
    return true;
  }

  function encode(tubes) {
    return tubes.map((tube) => tube.join("")).join("|");
  }

  function stateScore(tubes, capacities) {
    let score = 0;
    for (let i = 0; i < tubes.length; i += 1) {
      const tube = tubes[i];
      if (tube.length === 0) {
        score += 6;
        continue;
      }
      if (tube.length === capacities[i] && tube.every((value) => value === tube[0])) {
        score -= 24;
      }
      let blocks = 1;
      for (let j = 1; j < tube.length; j += 1) {
        if (tube[j] !== tube[j - 1]) {
          blocks += 1;
        }
      }
      score += blocks * 8;
      score -= topRun(tube).count * 2;
      score += capacities[i] - tube.length;
    }
    return score;
  }

  class MinQueue {
    constructor() {
      this.items = [];
    }

    push(item) {
      this.items.push(item);
      this.bubbleUp(this.items.length - 1);
    }

    pop() {
      if (this.items.length === 0) {
        return null;
      }
      const first = this.items[0];
      const last = this.items.pop();
      if (this.items.length > 0) {
        this.items[0] = last;
        this.sinkDown(0);
      }
      return first;
    }

    bubbleUp(index) {
      const item = this.items[index];
      while (index > 0) {
        const parentIndex = Math.floor((index - 1) / 2);
        const parent = this.items[parentIndex];
        if (item.priority >= parent.priority) {
          break;
        }
        this.items[parentIndex] = item;
        this.items[index] = parent;
        index = parentIndex;
      }
    }

    sinkDown(index) {
      const length = this.items.length;
      const item = this.items[index];
      while (true) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        let swapIndex = -1;
        if (leftIndex < length && this.items[leftIndex].priority < item.priority) {
          swapIndex = leftIndex;
        }
        if (
          rightIndex < length &&
          this.items[rightIndex].priority <
            (swapIndex === -1 ? item.priority : this.items[leftIndex].priority)
        ) {
          swapIndex = rightIndex;
        }
        if (swapIndex === -1) {
          break;
        }
        this.items[index] = this.items[swapIndex];
        this.items[swapIndex] = item;
        index = swapIndex;
      }
    }
  }

  function canPour(tubes, capacities, from, to) {
    if (from === to) {
      return null;
    }
    const source = tubes[from];
    const target = tubes[to];
    if (source.length === 0 || target.length >= capacities[to]) {
      return null;
    }
    const { color, count } = topRun(source);
    if (target.length > 0 && target[target.length - 1] !== color) {
      return null;
    }
    if (
      capacities[from] > 1 &&
      source.length === capacities[from] &&
      source.every((value) => value === color)
    ) {
      return null;
    }
    const room = capacities[to] - target.length;
    const amount = Math.min(count, room);
    if (amount <= 0) {
      return null;
    }
    return { color, amount };
  }

  function pour(tubes, from, to, amount) {
    const next = tubes.map((tube) => tube.slice());
    const moved = next[from].splice(next[from].length - amount, amount);
    next[to].push(...moved);
    return next;
  }

  function getMoves(tubes, capacities) {
    const moves = [];
    for (let from = 0; from < tubes.length; from += 1) {
      for (let to = 0; to < tubes.length; to += 1) {
        const move = canPour(tubes, capacities, from, to);
        if (!move) {
          continue;
        }
        const target = tubes[to];
        const source = tubes[from];
        if (target.length === 0) {
          let hasEarlierEmpty = false;
          for (let i = 0; i < to; i += 1) {
            if (i !== from && tubes[i].length === 0 && capacities[i] === capacities[to]) {
              hasEarlierEmpty = true;
              break;
            }
          }
          if (hasEarlierEmpty) {
            continue;
          }
          if (
            capacities[from] > 1 &&
            source.length === capacities[from] &&
            move.amount === source.length &&
            source.every((value) => value === move.color)
          ) {
            continue;
          }
        }
        moves.push({ from, to, ...move });
      }
    }
    moves.sort((a, b) => {
      const aToFilled = tubes[a.to].length > 0 ? 0 : 1;
      const bToFilled = tubes[b.to].length > 0 ? 0 : 1;
      return aToFilled - bToFilled || b.amount - a.amount;
    });
    return moves;
  }

  function reconstruct(node) {
    const states = [];
    const moves = [];
    let current = node;
    while (current) {
      states.push(current.tubes);
      if (current.move) {
        moves.push(current.move);
      }
      current = current.parent;
    }
    states.reverse();
    moves.reverse();
    return { states, moves };
  }

  function solveWithCapacities(inputTubes, capacities, options) {
    const limit = Number(options.searchLimit || 200000);
    const start = inputTubes.map(normalizeTube);
    const queue = new MinQueue();
    const seen = new Set();
    const startNode = {
      tubes: start,
      move: null,
      parent: null,
      depth: 0,
      priority: stateScore(start, capacities),
    };
    queue.push(startNode);
    seen.add(encode(start));

    let explored = 0;
    while (queue.items.length > 0 && explored < limit) {
      const node = queue.pop();
      explored += 1;
      if (isSolved(node.tubes, capacities)) {
        return {
          ok: true,
          explored,
          capacities,
          ...reconstruct(node),
        };
      }
      const moves = getMoves(node.tubes, capacities);
      for (const move of moves) {
        const nextTubes = pour(node.tubes, move.from, move.to, move.amount);
        const key = encode(nextTubes);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const depth = node.depth + 1;
        queue.push({
          tubes: nextTubes,
          move,
          parent: node,
          depth,
          priority: depth * 3 + stateScore(nextTubes, capacities),
        });
      }
    }

    return { ok: false, explored, exhausted: queue.items.length === 0, capacities };
  }

  function validate(inputTubes, capacities) {
    const counts = new Map();
    for (let i = 0; i < inputTubes.length; i += 1) {
      const tube = normalizeTube(inputTubes[i]);
      if (tube.length > capacities[i]) {
        return `瓶${i + 1}の色数が容量を超えています。`;
      }
      for (const color of tube) {
        counts.set(color, (counts.get(color) || 0) + 1);
      }
    }
    for (const [color, count] of counts.entries()) {
      if (count !== 4) {
        return `${color} は ${count} マスです。通常色は4マスずつ入力してください。`;
      }
    }
    return "";
  }

  function solveWaterSort(baseTubes, options) {
    const fullCapacity = Number(options.fullCapacity || 4);
    const emptyTubeCount = Number(options.emptyTubeCount || 0);
    const miniTubeLimit = Number(options.miniTubeLimit || 0);
    const filledTubes = baseTubes.map(normalizeTube).filter((tube) => tube.length > 0);
    const regularEmpty = Array.from({ length: emptyTubeCount }, () => []);
    const initialRegular = filledTubes.concat(regularEmpty);
    const regularCaps = Array.from({ length: initialRegular.length }, () => fullCapacity);
    const problem = validate(initialRegular, regularCaps);
    if (problem) {
      return { ok: false, error: problem };
    }

    for (let miniCount = 0; miniCount <= miniTubeLimit; miniCount += 1) {
      const tubes = initialRegular.concat(Array.from({ length: miniCount }, () => []));
      const capacities = regularCaps.concat(Array.from({ length: miniCount }, () => 1));
      const result = solveWithCapacities(tubes, capacities, options);
      if (result.ok) {
        return {
          ...result,
          miniCount,
          regularCount: initialRegular.length,
          totalExplored: result.explored,
        };
      }
    }
    return {
      ok: false,
      error: `探索上限内では解けませんでした。追加小瓶の上限または探索上限を増やしてください。`,
    };
  }

  window.WaterSortSolver = {
    solveWaterSort,
    EMPTY,
  };
})();
