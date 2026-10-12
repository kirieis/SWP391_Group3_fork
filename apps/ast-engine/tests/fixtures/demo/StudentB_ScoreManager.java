import java.util.ArrayList;
import java.util.List;

public class ScoreManager {

    private final List<String> studentList = new ArrayList<>();
    private final List<Double> markList = new ArrayList<>();

    // thêm một sinh viên kèm điểm
    private void register(String who, double mark) {
        if (mark < 0 || mark > 10) {
            throw new IllegalArgumentException("Mark must be in [0, 10]");
        }
        studentList.add(who);
        markList.add(mark);
    }

    // trung bình cộng
    private double mean() {
        if (markList.isEmpty()) {
            return 0;
        }
        double total = 0;
        int idx = 0;
        while (idx < markList.size()) {
            total += markList.get(idx);
            idx += 1;
        }
        return total / markList.size();
    }

    private int countAtLeast(double limit) {
        int result = 0;
        for (double m : markList) {
            if (m >= limit) {
                result += 1;
            }
        }
        return result;
    }

    private String top() {
        int pos = 0;
        for (int k = 1; k < markList.size(); k++) {
            if (markList.get(pos) < markList.get(k)) {
                pos = k;
            }
        }
        return studentList.get(pos);
    }

    private void show() {
        System.out.println("=== Score report ===");
        for (int j = 0; j < studentList.size(); j++) {
            System.out.println(studentList.get(j) + ": " + markList.get(j));
        }
        System.out.println("Average: " + mean());
        System.out.println("Passed: " + countAtLeast(5.0));
    }

    public static void main(String[] args) {
        ScoreManager manager = new ScoreManager();
        manager.register("An", 8.5);
        manager.register("Binh", 4.0);
        manager.register("Chi", 9.0);
        manager.show();
        System.out.println("Best: " + manager.top());
    }
}