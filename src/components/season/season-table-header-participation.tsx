import { ownNurbCombined } from "@/ir-data/utils/tracks";
import { TContent } from "@/ir-data/utils/types";
import { useIr } from "@/store/ir";
import { HStack, Text } from "@chakra-ui/react";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import TRACKS_JSON from "../../ir-data/tracks.json";
import { Tooltip } from "../ui/tooltip";
import { useTranslation } from "react-i18next";

const PARTICIPATION_THRESHOLD = 0.66;

function SeasonTableHeaderParticipation({
  seriesTracks,
}: {
  seriesTracks?: Record<string, number | number[]>;
}) {
  const { myTracks, wishTracks, weekOffDates } = useIr();
  const { t } = useTranslation();

  const {
    ownedTracks,
    wishedTracks,
    tracksNeeded,
    enoughTracks,
    enoughTracksWithWish,
  } = (() => {
    const filteredTracks = Object.fromEntries(
      Object.entries(seriesTracks ?? {}).filter(
        ([key]) => !key.includes("_cars") && !key.includes("_rainChance"),
      ),
    );

    const tracks = Object.entries(filteredTracks)
      .map(([week, trackId]) => {
        const track =
          TRACKS_JSON[
            (trackId as number).toString() as keyof typeof TRACKS_JSON
          ] as TContent | undefined;
        return track ? { week: week.toString(), track } : undefined;
      })
      .filter(Boolean) as { week: string; track: TContent }[];

    const tracksNeeded = Math.ceil(tracks.length * PARTICIPATION_THRESHOLD);

    let ownedTracks = 0;
    let wishedTracks = 0;

    for (const { week, track } of tracks) {
      if (weekOffDates.includes(week)) continue;

      if (track.free || myTracks.includes(track.sku) || ownNurbCombined(track.id, myTracks)) {
        ownedTracks++;
      } else if (wishTracks.includes(track.sku) || ownNurbCombined(track.id, wishTracks)) {
        wishedTracks++;
      }
    }

    return {
      ownedTracks,
      wishedTracks,
      tracksNeeded,
      enoughTracks: ownedTracks >= tracksNeeded,
      enoughTracksWithWish:
        ownedTracks < tracksNeeded &&
        ownedTracks + wishedTracks >= tracksNeeded,
    };
  })();

  const color = {
    base: enoughTracks
      ? "green.600"
      : enoughTracksWithWish
        ? "blue.600"
        : "red.600",
    _dark: enoughTracks
      ? "green.400"
      : enoughTracksWithWish
        ? "blue.400"
        : "red.400",
  };

  const bgColor = {
    base: enoughTracks
      ? "green.50"
      : enoughTracksWithWish
        ? "blue.50"
        : "red.50",
    _dark: enoughTracks
      ? "green.800"
      : enoughTracksWithWish
        ? "blue.800"
        : "red.800",
  };

  return (
    <Tooltip
      lazyMount
      unmountOnExit
      content={t("content.participationCredit", {
        eligible: enoughTracks ? t("content.yes") : t("content.no"),
        count: `${ownedTracks + wishedTracks}/${tracksNeeded}`,
      })}
      showArrow
      positioning={{ placement: "bottom" }}
      openDelay={200}
      closeDelay={100}
    >
      <HStack
        textStyle={"xs"}
        color={color}
        bgColor={bgColor}
        justifyContent={"center"}
        position={"absolute"}
        left={0}
        right={0}
        bottom={0.5}
        px={2}
      >
        <Text>
          {enoughTracks || enoughTracksWithWish ? (
            <FontAwesomeIcon icon={faCheck} />
          ) : (
            <FontAwesomeIcon icon={faXmark} />
          )}{" "}
          {ownedTracks + wishedTracks} / {tracksNeeded}
        </Text>
      </HStack>
    </Tooltip>
  );
}

export default SeasonTableHeaderParticipation;
