import { calculateParticipation } from "@/components/season/season-table-header-participation";
import {
  NURB_COMBINED_IDS,
  NURB_GP_SKU,
  NURB_NORDS_SKU,
} from "@/ir-data/utils/tracks";
import { TContent } from "@/ir-data/utils/types";
import TRACKS_JSON from "@/ir-data/tracks.json";
import { describe, expect, it } from "vitest";

// Use the real bundled tracks data instead of mocking it.
const TRACKS = TRACKS_JSON as unknown as Record<string, TContent>;

// Selectable tracks (excluding grouped sub-configs and sku-less entries).
const CONTENT_TRACKS = Object.values(TRACKS).filter(
  (track) =>
    track && typeof track.sku === "number" && track.sku > 0 && !("group" in track),
);

const NON_FREE_TRACKS = CONTENT_TRACKS.filter((track) => !track.free);
const FREE_TRACKS = CONTENT_TRACKS.filter((track) => track.free);
const FREE_TRACK = FREE_TRACKS[0];

const nonFree = (count: number) => NON_FREE_TRACKS.slice(0, count);
const skusOf = (tracks: TContent[]) => tracks.map((track) => track.sku);

// In the app, `myTracks` holds every free track plus the ones the user owns,
// so model it the same way here.
const myTracksWith = (...purchasedSkus: number[]) => [
  ...FREE_TRACKS.map((track) => track.sku),
  ...purchasedSkus,
];

// Week start dates. The order of the keys is the order of the weeks, exactly
// like `seriesDateMap` built from a season: the first entry is week 1, the
// second is week 2, and so on (duplicates are separate weeks).
const week = (n: number) => `2026-01-${String(n).padStart(2, "0")}`;

const seasonOf = (trackIds: number[]): Record<string, number> =>
  Object.fromEntries(
    trackIds.map((trackId, index) => [week(index + 1), trackId]),
  );

describe("calculateParticipation", () => {
  it("counts owned, wished and needed tracks", () => {
    const tracks = nonFree(5);

    const result = calculateParticipation({
      seriesTracks: seasonOf(tracks.map((track) => track.id)),
      myTracks: myTracksWith(...skusOf(tracks.slice(0, 2))),
      wishTracks: skusOf(tracks.slice(2, 3)),
      weekOffDates: [],
    });

    expect(result).toEqual({
      ownedTracks: 2,
      wishedTracks: 1,
      tracksNeeded: 4,
      enoughTracks: false,
      enoughTracksWithWish: false,
    });
  });

  it("computes participation for a typical 12-week season", () => {
    const distinctTracks = nonFree(11);
    // 12 races: the opening track is reused for the final week.
    const season = [...distinctTracks, distinctTracks[0]].map(
      (track) => track.id,
    );

    const result = calculateParticipation({
      seriesTracks: seasonOf(season),
      myTracks: myTracksWith(...skusOf(distinctTracks.slice(0, 7))),
      wishTracks: skusOf(distinctTracks.slice(7, 9)),
      weekOffDates: [],
    });

    // The opening track is also raced in week 12, so owning it counts twice.
    expect(result.ownedTracks).toBe(8);
    expect(result.wishedTracks).toBe(2);
    expect(result.tracksNeeded).toBe(8);
    expect(result.enoughTracks).toBe(true);
    expect(result.enoughTracksWithWish).toBe(false);
  });

  it("rounds the required track count up from the participation threshold", () => {
    const needed = (count: number) =>
      calculateParticipation({
        seriesTracks: seasonOf(nonFree(count).map((track) => track.id)),
        myTracks: myTracksWith(),
        wishTracks: [],
        weekOffDates: [],
      }).tracksNeeded;

    expect(needed(1)).toBe(1);
    expect(needed(3)).toBe(2);
    expect(needed(4)).toBe(3);
    expect(needed(5)).toBe(4);
    expect(needed(6)).toBe(4);
    expect(needed(8)).toBe(6);
    expect(needed(12)).toBe(8);
  });

  it("counts free tracks in the season as owned", () => {
    const result = calculateParticipation({
      seriesTracks: seasonOf([FREE_TRACK.id]),
      myTracks: myTracksWith(),
      wishTracks: [],
      weekOffDates: [],
    });

    expect(result.ownedTracks).toBe(1);
    expect(result.wishedTracks).toBe(0);
  });

  it("counts a free track as owned even when it is absent from myTracks", () => {
    const result = calculateParticipation({
      seriesTracks: seasonOf([FREE_TRACK.id]),
      myTracks: [],
      wishTracks: [],
      weekOffDates: [],
    });

    expect(result.ownedTracks).toBe(1);
  });

  it("ignores _cars and _rainChance keys", () => {
    const tracks = nonFree(2);

    const result = calculateParticipation({
      seriesTracks: {
        [week(1)]: tracks[0].id,
        [`${week(1)}_cars`]: [10, 20],
        [`${week(1)}_rainChance`]: 30,
        [week(2)]: tracks[1].id,
        [`${week(2)}_rainChance`]: 0,
      },
      myTracks: myTracksWith(...skusOf(tracks)),
      wishTracks: [],
      weekOffDates: [],
    });

    // Only the two real weeks count, so two tracks are needed and both owned.
    expect(result.tracksNeeded).toBe(2);
    expect(result.ownedTracks).toBe(2);
    expect(result.enoughTracks).toBe(true);
  });

  it("skips week-off weeks when counting but keeps them in the requirement", () => {
    const tracks = nonFree(5);

    const result = calculateParticipation({
      seriesTracks: seasonOf(tracks.map((track) => track.id)),
      myTracks: myTracksWith(...skusOf(tracks)),
      wishTracks: [],
      weekOffDates: [week(1)],
    });

    expect(result.ownedTracks).toBe(4);
    expect(result.tracksNeeded).toBe(4);
    expect(result.enoughTracks).toBe(true);
  });

  it("drops below the threshold when an owned week is marked off", () => {
    const tracks = nonFree(5);
    const seriesTracks = seasonOf(tracks.map((track) => track.id));
    const myTracks = myTracksWith(...skusOf(tracks.slice(0, 4)));

    const withoutWeekOff = calculateParticipation({
      seriesTracks,
      myTracks,
      wishTracks: [],
      weekOffDates: [],
    });
    expect(withoutWeekOff.ownedTracks).toBe(4);
    expect(withoutWeekOff.enoughTracks).toBe(true);

    const withWeekOff = calculateParticipation({
      seriesTracks,
      myTracks,
      wishTracks: [],
      weekOffDates: [week(1)],
    });
    expect(withWeekOff.ownedTracks).toBe(3);
    expect(withWeekOff.enoughTracks).toBe(false);
  });

  it("is eligible with wishlist tracks when owned tracks alone are not enough", () => {
    const tracks = nonFree(5);

    const result = calculateParticipation({
      seriesTracks: seasonOf(tracks.map((track) => track.id)),
      myTracks: myTracksWith(...skusOf(tracks.slice(0, 2))),
      wishTracks: skusOf(tracks.slice(2, 4)),
      weekOffDates: [],
    });

    expect(result.ownedTracks).toBe(2);
    expect(result.wishedTracks).toBe(2);
    expect(result.tracksNeeded).toBe(4);
    expect(result.enoughTracks).toBe(false);
    expect(result.enoughTracksWithWish).toBe(true);
  });

  it("counts a track that is both owned and wished only as owned", () => {
    const tracks = nonFree(3);

    const result = calculateParticipation({
      seriesTracks: seasonOf(tracks.map((track) => track.id)),
      myTracks: myTracksWith(...skusOf(tracks.slice(0, 2))),
      wishTracks: [tracks[0].sku, tracks[2].sku],
      weekOffDates: [],
    });

    expect(result.ownedTracks).toBe(2);
    expect(result.wishedTracks).toBe(1);
  });

  it("counts a repeated track per week and resolves each week independently", () => {
    const [first, second] = nonFree(2);
    const seriesTracks = {
      [week(1)]: first.id,
      [week(2)]: second.id,
      [week(3)]: first.id,
    };

    const noWeekOff = calculateParticipation({
      seriesTracks,
      myTracks: myTracksWith(first.sku),
      wishTracks: [],
      weekOffDates: [],
    });
    expect(noWeekOff.ownedTracks).toBe(2);

    const firstWeekOff = calculateParticipation({
      seriesTracks,
      myTracks: myTracksWith(first.sku),
      wishTracks: [],
      weekOffDates: [week(1)],
    });
    expect(firstWeekOff.ownedTracks).toBe(1);

    const lastWeekOff = calculateParticipation({
      seriesTracks,
      myTracks: myTracksWith(first.sku),
      wishTracks: [],
      weekOffDates: [week(3)],
    });
    expect(lastWeekOff.ownedTracks).toBe(1);
  });

  it("does not mutate the shared tracks data", () => {
    const [first, second] = nonFree(2);

    calculateParticipation({
      seriesTracks: {
        [week(1)]: first.id,
        [week(2)]: second.id,
        [week(3)]: first.id,
      },
      myTracks: myTracksWith(),
      wishTracks: [],
      weekOffDates: [],
    });

    expect("week" in TRACKS[String(first.id)]).toBe(false);
    expect("week" in TRACKS[String(second.id)]).toBe(false);
  });

  it("ignores unknown track ids without throwing", () => {
    let unknownId = 1;
    while (TRACKS[String(unknownId)]) unknownId++;

    const tracks = nonFree(2);

    const result = calculateParticipation({
      seriesTracks: {
        [week(1)]: tracks[0].id,
        [week(2)]: unknownId,
        [week(3)]: tracks[1].id,
      },
      myTracks: myTracksWith(...skusOf(tracks)),
      wishTracks: [],
      weekOffDates: [],
    });

    expect(result.tracksNeeded).toBe(2);
    expect(result.ownedTracks).toBe(2);
    expect(result.enoughTracks).toBe(true);
  });

  it("treats a Nurburgring combined track as owned with both Nordschleife and GP", () => {
    const nurbId = NURB_COMBINED_IDS[0];

    const owned = calculateParticipation({
      seriesTracks: seasonOf([nurbId]),
      myTracks: myTracksWith(NURB_NORDS_SKU, NURB_GP_SKU),
      wishTracks: [],
      weekOffDates: [],
    });
    expect(owned.ownedTracks).toBe(1);

    const partiallyOwned = calculateParticipation({
      seriesTracks: seasonOf([nurbId]),
      myTracks: myTracksWith(NURB_NORDS_SKU),
      wishTracks: [],
      weekOffDates: [],
    });
    expect(partiallyOwned.ownedTracks).toBe(0);
  });

  it("treats a Nurburgring combined track as wished with both pieces on the wishlist", () => {
    const result = calculateParticipation({
      seriesTracks: seasonOf([NURB_COMBINED_IDS[0]]),
      myTracks: myTracksWith(),
      wishTracks: [NURB_NORDS_SKU, NURB_GP_SKU],
      weekOffDates: [],
    });

    expect(result.ownedTracks).toBe(0);
    expect(result.wishedTracks).toBe(1);
  });

  it("returns an empty summary when there are no tracks", () => {
    const result = calculateParticipation({
      seriesTracks: undefined,
      myTracks: myTracksWith(),
      wishTracks: [],
      weekOffDates: [],
    });

    expect(result).toEqual({
      ownedTracks: 0,
      wishedTracks: 0,
      tracksNeeded: 0,
      enoughTracks: true,
      enoughTracksWithWish: false,
    });
  });
});
