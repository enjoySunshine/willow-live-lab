import { expect } from 'chai';
import { TimestampOffsets } from '../../../src/utils/timestamp-offsets';

const benchmarkTableSize = 1000;
const maxDurationMs = 5;

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildTable(size: number, startCc: number): TimestampOffsets {
  const table = new TimestampOffsets();
  for (let i = 0; i < size; i++) {
    table.set(startCc + i, {
      baseTime: i * 90000,
      timescale: 90000,
      trackId: 1,
    });
  }
  return table;
}

describe('TimestampOffsets', function () {
  describe('removeBefore', function () {
    it('removes finished discontinuities and keeps the current one', function () {
      // Two-million discontinuity sequence
      const table = new TimestampOffsets([
        [1999990, { baseTime: 1, timescale: 90000, trackId: 1 }],
        [2000000, { baseTime: 900000, timescale: 90000, trackId: 2 }],
      ]);

      table.removeBefore(2000000);

      expect(table.size).to.equal(1);
      expect(table.get(1999990)).to.equal(undefined);
      expect(table.get(2000000)).to.deep.equal({
        baseTime: 900000,
        timescale: 90000,
        trackId: 2,
      });
    });

    it('applies the same rules to small sequence numbers', function () {
      const table = new TimestampOffsets([
        [0, { baseTime: 100, timescale: 1000, trackId: 7 }],
        [1, { baseTime: 50, timescale: 90000, trackId: 3 }],
      ]);

      table.removeBefore(1);

      expect(table.size).to.equal(1);
      expect(table.get(0)).to.equal(undefined);
      expect(table.get(1)).to.deep.equal({
        baseTime: 50,
        timescale: 90000,
        trackId: 3,
      });
    });

    it('keeps entries above the boundary and is a no-op when nothing matches', function () {
      const table = new TimestampOffsets([
        [2, { baseTime: 1, timescale: 90000, trackId: 1 }],
        [3, { baseTime: 2, timescale: 90000, trackId: 2 }],
      ]);

      table.removeBefore(2);
      expect(table.size).to.equal(2);

      table.removeBefore(10);
      expect(table.size).to.equal(0);
    });
  });

  describe('clone', function () {
    it('hands an independent table to audio, subtitles and video without mutating values', function () {
      const table = new TimestampOffsets([
        [1999990, { baseTime: 1, timescale: 90000, trackId: 1 }],
        [2000000, { baseTime: 900000, timescale: 90000, trackId: 2 }],
      ]);
      table.removeBefore(2000000);

      const audioSubtitles = table.clone();
      const video = table.clone();

      expect(audioSubtitles).to.not.equal(table);
      expect(video).to.not.equal(table);
      expect(audioSubtitles).to.not.equal(video);

      [audioSubtitles, video].forEach((copy) => {
        expect(copy.get(2000000)).to.deep.equal({
          baseTime: 900000,
          timescale: 90000,
          trackId: 2,
        });
      });

      // Removing on one copy does not affect the source or the other copy
      audioSubtitles.clear();
      expect(audioSubtitles.size).to.equal(0);
      expect(video.size).to.equal(1);
      expect(table.size).to.equal(1);
    });

    it('shares TimestampOffset objects, matching the previous slice() behavior', function () {
      const offset = { baseTime: 50, timescale: 90000, trackId: 3 };
      const table = new TimestampOffsets([[1, offset]]);

      expect(table.clone().get(1)).to.equal(offset);
    });
  });

  describe('set / get / has', function () {
    it('stores and reads back entries by discontinuity sequence number', function () {
      const table = new TimestampOffsets();
      table.set(2000000, {
        baseTime: 900000,
        timescale: 90000,
        trackId: 2,
      });

      expect(table.has(2000000)).to.equal(true);
      expect(table.get(2000000)).to.deep.equal({
        baseTime: 900000,
        timescale: 90000,
        trackId: 2,
      });
      expect(table.get(1999990)).to.equal(undefined);
      expect(table.length).to.equal(1);
    });

    it('does not allocate empty slots for large sequence numbers', function () {
      const table = new TimestampOffsets();
      table.set(2000000, { baseTime: 1, timescale: 90000, trackId: 1 });

      expect(table.size).to.equal(1);
      expect(table.length).to.equal(1);
    });
  });

  describe('entries', function () {
    it('returns entries ordered by discontinuity sequence number', function () {
      const table = new TimestampOffsets([
        [1, { baseTime: 50, timescale: 90000, trackId: 3 }],
        [0, { baseTime: 100, timescale: 1000, trackId: 7 }],
      ]);

      expect(table.entries().map(([cc]) => cc)).to.deep.equal([0, 1]);
    });
  });

  describe('performance', function () {
    it('prunes a large-sequence table within the time budget', function () {
      // Warm-up run on the 1000-entry table (not measured)
      const warmup = buildTable(benchmarkTableSize, 0);
      warmup.removeBefore(benchmarkTableSize);

      const durations: number[] = [];
      for (let run = 0; run < 3; run++) {
        // All entries sit below the current discontinuity, which itself is kept
        const table = buildTable(
          benchmarkTableSize,
          2000000 - benchmarkTableSize,
        );
        table.set(2000000, {
          baseTime: 900000,
          timescale: 90000,
          trackId: 2,
        });
        const start = performance.now();
        table.removeBefore(2000000);
        durations.push(performance.now() - start);
        expect(table.size).to.equal(1);
        expect(table.get(2000000)?.trackId).to.equal(2);
      }

      expect(median(durations)).to.be.below(maxDurationMs);
    });

    it('updates an entry and hands the table over within the time budget', function () {
      const warmup = buildTable(benchmarkTableSize, 0);
      warmup.set(benchmarkTableSize, {
        baseTime: 1,
        timescale: 90000,
        trackId: 1,
      });
      warmup.clone();

      const durations: number[] = [];
      for (let run = 0; run < 3; run++) {
        const table = buildTable(
          benchmarkTableSize,
          2000000 - benchmarkTableSize,
        );
        const start = performance.now();
        table.set(2000000, {
          baseTime: 900000,
          timescale: 90000,
          trackId: 2,
        });
        const copy = table.clone();
        durations.push(performance.now() - start);
        expect(copy.size).to.equal(benchmarkTableSize + 1);
        expect(copy.get(2000000)?.baseTime).to.equal(900000);
      }

      expect(median(durations)).to.be.below(maxDurationMs);
    });

    it('hands the table over to the frame track within the time budget', function () {
      const warmup = buildTable(benchmarkTableSize, 0);
      warmup.clone();

      const durations: number[] = [];
      for (let run = 0; run < 3; run++) {
        const table = buildTable(
          benchmarkTableSize,
          2000000 - benchmarkTableSize,
        );
        const start = performance.now();
        const copy = table.clone();
        durations.push(performance.now() - start);
        expect(copy.size).to.equal(benchmarkTableSize);
      }

      expect(median(durations)).to.be.below(maxDurationMs);
    });
  });
});
