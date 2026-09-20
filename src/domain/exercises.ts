import type { LiftKey } from './types';

export interface ExerciseDemo {
  id: string;
  name: string;
  instructions: string[];
  images: string[]; // absolute app paths
}

export const EXERCISE_DEMOS: Record<LiftKey, ExerciseDemo> = {
  press: {
    id: 'Barbell_Shoulder_Press',
    name: 'Barbell Shoulder Press',
    instructions: [
      'Sit on a bench with back support in a squat rack. Position a barbell at a height that is just above your head. Grab the barbell with a pronated grip (palms facing forward).',
      'Once you pick up the barbell with the correct grip width, lift the bar up over your head by locking your arms. Hold at about shoulder level and slightly in front of your head. This is your starting position.',
      'Lower the bar down to the shoulders slowly as you inhale.',
      'Lift the bar back up to the starting position as you exhale.',
      'Repeat for the recommended amount of repetitions.',
    ],
    images: ['/exercises/Barbell_Shoulder_Press/0.jpg', '/exercises/Barbell_Shoulder_Press/1.jpg'],
  },
  bench: {
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Barbell Bench Press',
    instructions: [
      'Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movement between the forearms and the upper arms), lift the bar from the rack and hold it straight over you with your arms locked. This will be your starting position.',
      'From the starting position, breathe in and begin coming down slowly until the bar touches your middle chest.',
      'After a brief pause, push the bar back to the starting position as you breathe out. Focus on pushing the bar using your chest muscles. Lock your arms and squeeze your chest in the contracted position at the top of the motion, hold for a second and then start coming down slowly again. Tip: Ideally, lowering the weight should take about twice as long as raising it.',
      'Repeat the movement for the prescribed amount of repetitions.',
      'When you are done, place the bar back in the rack.',
    ],
    images: [
      '/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg',
      '/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg',
    ],
  },
  squat: {
    id: 'Barbell_Full_Squat',
    name: 'Barbell Squat',
    instructions: [
      'This exercise is best performed inside a squat rack for safety purposes. To begin, first set the bar on a rack just above shoulder level. Once the correct height is chosen and the bar is loaded, step under the bar and place the back of your shoulders (slightly below the neck) across it.',
      'Hold on to the bar using both arms at each side and lift it off the rack by first pushing with your legs and at the same time straightening your torso.',
      'Step away from the rack and position your legs using a shoulder-width medium stance with the toes slightly pointed out. Keep your head up at all times and maintain a straight back. This will be your starting position.',
      'Begin to slowly lower the bar by bending the knees and sitting back with your hips as you maintain a straight posture with the head up. Continue down until your hamstrings are on your calves. Inhale as you perform this portion of the movement.',
      'Begin to raise the bar as you exhale by pushing the floor with the heel or middle of your foot as you straighten the legs and extend the hips to go back to the starting position.',
      'Repeat for the recommended amount of repetitions.',
    ],
    images: ['/exercises/Barbell_Full_Squat/0.jpg', '/exercises/Barbell_Full_Squat/1.jpg'],
  },
  deadlift: {
    id: 'Barbell_Deadlift',
    name: 'Barbell Deadlift',
    instructions: [
      'Stand in front of a loaded barbell.',
      'While keeping the back as straight as possible, bend your knees, bend forward and grasp the bar using a medium (shoulder width) overhand grip. This will be the starting position of the exercise. Tip: If it is difficult to hold on to the bar with this grip, alternate your grip or use wrist straps.',
      'While holding the bar, start the lift by pushing with your legs while simultaneously getting your torso to the upright position as you breathe out. In the upright position, stick your chest out and contract the back by bringing the shoulder blades back. Think of how the soldiers in the military look when they are in standing in attention.',
      'Go back to the starting position by bending at the knees while simultaneously leaning the torso forward at the waist while keeping the back straight. When the weights on the bar touch the floor you are back at the starting position and ready to perform another repetition.',
      'Perform the amount of repetitions prescribed in the program.',
    ],
    images: ['/exercises/Barbell_Deadlift/0.jpg', '/exercises/Barbell_Deadlift/1.jpg'],
  },
};

export function getExerciseDemo(liftKey: LiftKey): ExerciseDemo {
  return EXERCISE_DEMOS[liftKey];
}
